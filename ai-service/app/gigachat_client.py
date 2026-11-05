"""Единственное место, где создаётся клиент GigaChat.

SDK сам получает токен доступа по ключу авторизации (он живёт около 30 минут) и обновляет его.
Повторные попытки при временных сбоях (429, 5xx) тоже делает SDK: у нас их нет, чтобы не было «двойных» повторов.
"""
from __future__ import annotations

from gigachat import GigaChat

from app.config import get_settings

_client: GigaChat | None = None


def get_client() -> GigaChat:
    global _client
    if _client is None:
        settings = get_settings()
        if not settings.gigachat_credentials:
            raise RuntimeError(
                "Не задан GIGACHAT_CREDENTIALS (ключ авторизации из Studio). Он нужен только при LLM_PROVIDER=gigachat или EMBEDDING_PROVIDER=gigachat"
            )
        options: dict = {
            "credentials": settings.gigachat_credentials,
            "scope": settings.gigachat_scope,
            "model": settings.gigachat_model,  # в SDK нет модели по умолчанию
            "timeout": settings.gigachat_timeout,
            "verify_ssl_certs": settings.gigachat_verify_ssl_certs,
            "max_retries": 3,
            "retry_backoff_factor": 1.0,
        }
        if settings.gigachat_ca_bundle_file:
            options["ca_bundle_file"] = settings.gigachat_ca_bundle_file
        if settings.gigachat_base_url:
            options["base_url"] = settings.gigachat_base_url
        _client = GigaChat(**options)
    return _client


def close_client() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
