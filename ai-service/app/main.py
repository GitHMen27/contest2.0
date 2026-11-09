"""REST API: поиск по регламентам и ответы с источниками.

Запуск из папки ai-service/:
    uvicorn app.main:app --reload --port 8000
Документация (Swagger): http://localhost:8000/docs
"""
from __future__ import annotations

import hmac
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.auth import router as auth_router
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
