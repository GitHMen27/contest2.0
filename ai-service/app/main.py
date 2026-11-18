"""REST API: поиск по регламентам и ответы с источниками.

Запуск из папки ai-service/:
    uvicorn app.main:app --reload --port 8000
Документация (Swagger): http://localhost:8000/docs
"""
from __future__ import annotations

import hmac
import json
import logging
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from app.auth import require_admin, router as auth_router
from app.config import get_settings
from app.ratelimit import RateLimiter

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("app.main")

_limiter: RateLimiter | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.cloud_client import close_cloud_client
    from app.db import close_pool, get_pool
    from app.gigachat_client import close_client

    pool = get_pool()
    try:
        pool.wait(timeout=20)
    except Exception:  # noqa: BLE001: сервер запускаем в любом случае, /health покажет проблему
        logger.exception("Не удалось подключиться к базе при старте")
    yield
    close_pool()
    close_client()
    close_cloud_client()


settings = get_settings()
app = FastAPI(
    title="WB Dispatcher AI: RAG API",
    description="Вопросы по регламентам диспетчера: гибридный поиск + LLM (Cloud.ru Foundation Models или GigaChat)",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex or None,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
app.include_router(auth_router)


def guard(request: Request, x_api_key: str | None = Header(default=None)) -> None:
    """Проверка ключа доступа (если задан APP_API_KEY) и ограничение частоты запросов."""
    global _limiter
    current = get_settings()
    if current.app_api_key and not (x_api_key and hmac.compare_digest(x_api_key, current.app_api_key)):
        raise HTTPException(status_code=401, detail="Неверный или отсутствующий X-API-Key")
    if _limiter is None:
        _limiter = RateLimiter(limit=current.rate_limit_per_minute)
    client_ip = request.client.host if request.client else "unknown"
    if not _limiter.allow(client_ip):
        raise HTTPException(status_code=429, detail="Слишком много запросов, попробуй через минуту")


class QuestionRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=1000, examples=["Сколько часов в сутки может управлять водитель?"])
    top_n: int = Field(4, ge=1, le=8, description="Сколько фрагментов отдать модели")
    fetch_k: int = Field(8, ge=1, le=30, description="Сколько кандидатов брать из каждого поиска")


class Source(BaseModel):
    doc: str
    section: str
    content: str
    score: float
    via: list[str]


class SearchResponse(BaseModel):
    hits: list[Source]


class AnswerResponse(BaseModel):
    answer: str
    sources: list[Source]


def _to_sources(hits) -> list[Source]:
    return [Source(doc=h.doc, section=h.section, content=h.content, score=h.score, via=h.via) for h in hits]


ActionKind = Literal[
    "create_task",
    "create_incident",
    "assign_employee",
    "change_incident_status",
    "change_task_status",
]

TASK_PRIORITIES = {"urgent", "high", "normal", "low"}
TASK_STATUSES = {"new", "in_progress", "blocked", "done"}
INCIDENT_STATUSES = {"new", "in_progress", "resolved"}
INCIDENT_SEVERITIES = {"critical", "high", "medium", "low"}
INCIDENT_CATEGORIES = {"hub", "warehouse", "transport", "staff", "equipment", "sla"}


class OpsAssistRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=1000)
    snapshot: dict[str, Any] = Field(default_factory=dict, description="Снимок сети и склада, собранный фронтендом")


class AiProposal(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    id: str
    kind: ActionKind
    title: str
    description: str
    reason: str
    summary: str
    payload: dict[str, Any]
    requires_admin: bool = Field(default=True, alias="requiresAdmin")


class OpsAssistResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    answer: str
    findings: list[str]
    proposals: list[AiProposal]
    generated_at: int = Field(..., alias="generatedAt")
    source: Literal["backend"] = "backend"


class AiActionRequest(BaseModel):
    kind: ActionKind
    title: str = Field(..., min_length=1, max_length=200)
    payload: dict[str, Any]
    summary: str = Field(default="", max_length=500)


class AiActionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    accepted: bool = True
    audit_id: str = Field(..., alias="auditId")
    at: int
    actor: str
    kind: ActionKind


class AiAuditResponse(BaseModel):
    entries: list[dict[str, Any]]
    count: int


_AUDIT_LOCK = threading.Lock()


def _audit_file() -> Path:
    return Path(get_settings().ai_audit_path)


def _append_audit(entry: dict[str, Any]) -> None:
    path = _audit_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(entry, ensure_ascii=False, separators=(",", ":"))
    with _AUDIT_LOCK:
        with path.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")


def _read_audit(limit: int) -> list[dict[str, Any]]:
    path = _audit_file()
    if not path.exists():
        return []
    with _AUDIT_LOCK:
        lines = path.read_text(encoding="utf-8").splitlines()
    entries: list[dict[str, Any]] = []
    for line in reversed(lines[-limit:]):
        try:
            value = json.loads(line)
        except (TypeError, ValueError):
            continue
        if isinstance(value, dict):
            entries.append(value)
    return entries


def _require_text(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise HTTPException(status_code=422, detail=f"В действии отсутствует поле {key}.")
    return value.strip()


def _optional_text(payload: dict[str, Any], key: str) -> str | None:
    value = payload.get(key)
    return value.strip() if isinstance(value, str) and value.strip() else None


def _validate_action(kind: ActionKind, payload: dict[str, Any]) -> None:
    """Проверка действия до записи в аудит: никаких «пустых» или неизвестных операций."""
    if kind == "create_task":
        _require_text(payload, "title")
        _require_text(payload, "zoneId")
        priority = _require_text(payload, "priority")
        if priority not in TASK_PRIORITIES:
            raise HTTPException(status_code=422, detail="Недопустимый приоритет задачи.")
        due_at = payload.get("dueAt")
        if due_at is not None and not isinstance(due_at, (int, float)):
            raise HTTPException(status_code=422, detail="dueAt должен быть числом (Unix ms).")
        return
    if kind == "create_incident":
        _require_text(payload, "title")
        _require_text(payload, "description")
        _require_text(payload, "hubId")
        _require_text(payload, "owner")
        severity = _require_text(payload, "severity")
        category = _require_text(payload, "category")
        if severity not in INCIDENT_SEVERITIES:
            raise HTTPException(status_code=422, detail="Недопустимая важность инцидента.")
        if category not in INCIDENT_CATEGORIES:
            raise HTTPException(status_code=422, detail="Недопустимая категория инцидента.")
        return
    if kind == "assign_employee":
        _require_text(payload, "taskId")
        _require_text(payload, "assigneeId")
        return
    if kind == "change_incident_status":
        _require_text(payload, "incidentId")
        status = _require_text(payload, "status")
        if status not in INCIDENT_STATUSES:
            raise HTTPException(status_code=422, detail="Недопустимый статус инцидента.")
        return
    if kind == "change_task_status":
        _require_text(payload, "taskId")
        status = _require_text(payload, "status")
        if status not in TASK_STATUSES:
            raise HTTPException(status_code=422, detail="Недопустимый статус задачи.")
        return
    raise HTTPException(status_code=422, detail="Неизвестное действие.")


def _fail(error: Exception, what: str) -> HTTPException:
    logger.exception("Ошибка: %s", what)
    # Понятное сообщение показываем только для наших собственных ошибок (RuntimeError с подсказкой)
    detail = str(error) if isinstance(error, RuntimeError) else f"Внутренняя ошибка: {what}"
    return HTTPException(status_code=502, detail=detail)


@app.get("/health", tags=["service"])
def health():
    """Проверка, что сервис жив и база подключена."""
    from app.db import connection
    from app.setup_db import DIM_SQL

    try:
        with connection() as conn:
            chunks = conn.execute("SELECT count(*) FROM doc_chunks").fetchone()[0]
            dim_row = conn.execute(DIM_SQL).fetchone()
    except Exception as error:  # noqa: BLE001
        logger.exception("health: база недоступна")
        raise HTTPException(status_code=503, detail="База данных недоступна") from error
    current = get_settings()
    embedding_model = current.cloud_embedding_model if current.embedding_provider == "cloudru" else current.gigachat_embedding_model
    llm_model = current.cloud_chat_model if current.llm_provider == "cloudru" else current.gigachat_model
    return {
        "status": "ok",
        "chunks": chunks,
        "llm_provider": current.llm_provider,
        "llm_model": llm_model or None,
        "embedding_provider": current.embedding_provider,
        "embedding_model": embedding_model,
        "embedding_dim": dim_row[0] if dim_row else None,
    }


@app.post("/rag/search", response_model=SearchResponse, tags=["rag"], dependencies=[Depends(guard)])
def rag_search(req: QuestionRequest):
    """Только поиск: возвращает подходящие фрагменты регламентов, без вызова модели для ответа."""
    from app.retrieval import search

    try:
        return SearchResponse(hits=_to_sources(search(req.question, top_n=req.top_n, fetch_k=req.fetch_k)))
    except Exception as error:  # noqa: BLE001
        raise _fail(error, "поиск") from error


@app.post("/rag/ask", response_model=AnswerResponse, tags=["rag"], dependencies=[Depends(guard)])
def rag_ask(req: QuestionRequest):
    """Полный RAG: поиск -> модель -> ответ со ссылками [1], [2] и списком источников."""
    from app.rag import answer

    try:
        text, hits = answer(req.question, top_n=req.top_n, fetch_k=req.fetch_k)
    except Exception as error:  # noqa: BLE001
        raise _fail(error, "ответ") from error
    return AnswerResponse(answer=text, sources=_to_sources(hits))


@app.post("/ai/assist", response_model=OpsAssistResponse, tags=["ai"], dependencies=[Depends(guard)])
def ai_assist(req: OpsAssistRequest):
    """Анализ операционного снимка и безопасные черновики действий.

    Эндпойнт ничего не меняет: только читает переданный снимок и возвращает предложения.
    """
    from app.ops import analyze

    try:
        result = analyze(req.snapshot, req.question)
    except Exception as error:  # noqa: BLE001
        raise _fail(error, "AI-анализ операций") from error
    return OpsAssistResponse(**result)


@app.post("/ai/action", response_model=AiActionResponse, tags=["ai"])
def ai_action(
    req: AiActionRequest,
    user: dict = Depends(require_admin),
    _: None = Depends(guard),
):
    """Подтверждённое администратором действие.

    Сервер проверяет права и формат, пишет запись в аудит и только после этого фронтенд
    применяет изменение к локальному демо-состоянию. Неподтверждённые действия сюда не попадают.
    """
    _validate_action(req.kind, req.payload)
    audit_id = str(uuid4())
    at = int(time.time() * 1000)
    entry = {
        "id": audit_id,
        "at": at,
        "actor": user["sub"],
        "role": user["role"],
        "kind": req.kind,
        "title": req.title,
        "summary": req.summary,
        "payload": req.payload,
        "result": "accepted",
        "source": "ai-confirmed",
    }
    try:
        _append_audit(entry)
    except OSError as error:
        logger.exception("Не удалось записать AI-аудит")
        raise HTTPException(status_code=503, detail="Журнал AI-действий недоступен") from error
    logger.info("AI action %s by %s: %s", req.kind, user["sub"], req.title)
    return AiActionResponse(audit_id=audit_id, at=at, actor=user["sub"], kind=req.kind)


@app.get("/ai/audit", response_model=AiAuditResponse, tags=["ai"], dependencies=[Depends(guard)])
def ai_audit(
    limit: int = Query(20, ge=1, le=200, description="Сколько последних записей вернуть"),
    user: dict = Depends(require_admin),
):
    """Последние подтверждённые AI-действия. Доступно только администратору."""
    entries = _read_audit(limit)
    return AiAuditResponse(entries=entries, count=len(entries))
