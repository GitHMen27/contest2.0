"""Авторизация и роли: вход по логину и паролю, подписанный токен (HMAC-SHA256), проверка роли.

Учётные записи задаются переменными окружения (см. .env.example, раздел «Авторизация»):
    AUTH_SECRET, AUTH_ADMIN_USERNAME/PASSWORD, AUTH_USER_USERNAME/PASSWORD.
Роль определяет сервер по тому, чей пароль введён. Фронтенд роль не выбирает и подделать её не может:
токен подписан секретом, которого у браузера нет.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.ratelimit import RateLimiter

Role = Literal["admin", "user"]

MIN_SECRET_LENGTH = 16

router = APIRouter(prefix="/auth", tags=["auth"])

_login_limiter: RateLimiter | None = None


# --- Токен ----------------------------------------------------------------------------------------

def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _sign(body: str, secret: str) -> str:
    return _b64encode(hmac.new(secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest())


def create_token(username: str, role: Role, secret: str, ttl_seconds: int, now: float | None = None) -> str:
    issued = time.time() if now is None else now
    payload = {"sub": username, "role": role, "exp": int(issued + ttl_seconds)}
    body = _b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    return f"{body}.{_sign(body, secret)}"


def verify_token(token: str, secret: str, now: float | None = None) -> dict | None:
    """Возвращает содержимое токена или None, если подпись неверна, токен просрочен или повреждён."""
    try:
        body, signature = token.split(".", 1)
        if not hmac.compare_digest(signature, _sign(body, secret)):
            return None
        payload = json.loads(_b64decode(body))
    except (ValueError, TypeError):
        return None
    if not isinstance(payload, dict) or payload.get("role") not in ("admin", "user"):
        return None
    if not isinstance(payload.get("sub"), str) or not isinstance(payload.get("exp"), int):
        return None
    current = time.time() if now is None else now
    if payload["exp"] <= current:
        return None
    return payload


# --- Учётные записи -------------------------------------------------------------------------------

def _accounts(settings: Settings) -> list[tuple[str, str, Role]]:
    accounts: list[tuple[str, str, Role]] = []
    if settings.auth_admin_password:
        accounts.append((settings.auth_admin_username, settings.auth_admin_password, "admin"))
    if settings.auth_user_password:
        accounts.append((settings.auth_user_username, settings.auth_user_password, "user"))
    return accounts


def _same(left: str, right: str) -> bool:
    return hmac.compare_digest(left.encode("utf-8"), right.encode("utf-8"))


def _require_configured(settings: Settings) -> list[tuple[str, str, Role]]:
    accounts = _accounts(settings)
    if len(settings.auth_secret) < MIN_SECRET_LENGTH or not accounts:
        raise HTTPException(
            status_code=503,
            detail="Вход не настроен на сервере: задайте AUTH_SECRET (от 16 символов) и пароли AUTH_ADMIN_PASSWORD / AUTH_USER_PASSWORD.",
        )
    return accounts


# --- Эндпойнты ------------------------------------------------------------------------------------

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=256)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: Role
    expires_in: int = Field(..., description="Через сколько секунд токен перестанет действовать")


class MeResponse(BaseModel):
    username: str
    role: Role
    expires_at: int


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, request: Request):
    """Вход: возвращает токен и роль (admin или user). Роль определяет сервер."""
    global _login_limiter
    settings = get_settings()
    accounts = _require_configured(settings)

    if _login_limiter is None:
        _login_limiter = RateLimiter(limit=settings.auth_login_attempts_per_minute)
    client_ip = request.client.host if request.client else "unknown"
    if not _login_limiter.allow(client_ip):
        raise HTTPException(status_code=429, detail="Слишком много попыток входа, попробуйте через минуту")

    matched: tuple[str, Role] | None = None
    for username, password, role in accounts:  # проверяем все записи, чтобы время ответа не выдавало, какая подошла
        if _same(req.username, username) & _same(req.password, password):
            matched = (username, role)
    if matched is None:
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    ttl = max(1, settings.auth_token_ttl_minutes) * 60
    token = create_token(matched[0], matched[1], settings.auth_secret, ttl)
    return LoginResponse(access_token=token, username=matched[0], role=matched[1], expires_in=ttl)


def current_user(authorization: str | None = Header(default=None)) -> dict:
    """Зависимость: достаёт пользователя из заголовка Authorization: Bearer <токен>."""
    settings = get_settings()
    _require_configured(settings)
    scheme, _, token = (authorization or "").partition(" ")
    payload = verify_token(token.strip(), settings.auth_secret) if scheme.lower() == "bearer" and token else None
    if payload is None:
        raise HTTPException(status_code=401, detail="Требуется вход: токен отсутствует, неверен или просрочен")
    return payload


def require_admin(user: dict = Depends(current_user)) -> dict:
    """Зависимость для защищённых эндпойнтов администратора."""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Недостаточно прав: нужна роль администратора")
    return user


@router.get("/me", response_model=MeResponse)
def me(user: dict = Depends(current_user)):
    """Проверка токена: фронтенд вызывает при открытии сайта, чтобы узнать актуальную роль."""
    return MeResponse(username=user["sub"], role=user["role"], expires_at=user["exp"])


@router.get("/admin-check", response_model=MeResponse)
def admin_check(user: dict = Depends(require_admin)):
    """Доступен только администратору. Фронтенд использует его, чтобы подтвердить роль перед админ-страницами."""
    return MeResponse(username=user["sub"], role=user["role"], expires_at=user["exp"])
