"""
REST API поверх RAG-системы (BM25 + ChromaDB + Cross-Encoder reranker + Gemini).

Запуск (из папки, где лежат db.py и rerank_query.py):
    uvicorn api:app --port 8000

Документация (Swagger): http://localhost:8000/docs
"""
import logging
from contextlib import asynccontextmanager

import chromadb
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field
from rank_bm25 import BM25Okapi

# Переиспользуем готовые функции из твоего rerank_query.py.
# Важно: при импорте там один раз загружается CrossEncoder -
# то есть модель грузится при старте сервера, а не на каждый запрос.
from rerank_query import (
    generate_answer,
    get_embedding,
    load_and_chunk_file,
    rerank_chunks,
    tokenize,
)

logger = logging.getLogger("rag_api")

RULES_PATH = "../rule.txt"
CHROMA_PATH = "./chroma_db"
COLLECTION_NAME = "company_rules"


# ---------------------------------------------------------------
# Старт приложения: тяжёлые объекты создаются ОДИН раз
# ---------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    chunks = load_and_chunk_file(RULES_PATH)
    app.state.chunks = chunks
    # BM25-индекс строим один раз (в консольной версии он строился на каждый запрос)
    app.state.bm25 = BM25Okapi([tokenize(c) for c in chunks])

    chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)
    app.state.collection = chroma_client.get_collection(name=COLLECTION_NAME)

    logger.info("RAG готов: %d чанков", len(chunks))
    yield


app = FastAPI(
    title="Company Rules RAG API",
    description="Вопросы по правилам компании: гибридный поиск + reranker + Gemini",
    version="1.0.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------
# Схемы запросов / ответов (Pydantic)
# ---------------------------------------------------------------
class QuestionRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000, examples=["Сколько дней отпуска положено?"])
    fetch_k: int = Field(5, ge=1, le=20, description="Сколько кандидатов брать из BM25 и из ChromaDB")
    top_n: int = Field(2, ge=1, le=10, description="Сколько чанков оставить после reranker")


class AnswerResponse(BaseModel):
    answer: str
    sources: list[str]


class SearchResponse(BaseModel):
    chunks: list[str]


class HealthResponse(BaseModel):
    status: str
    chunks_in_file: int
    chunks_in_db: int


# ---------------------------------------------------------------
# Поиск (логика hybrid_search_with_rerank, но на готовых индексах)
# ---------------------------------------------------------------
def retrieve(request: Request, req: QuestionRequest) -> list[str]:
    state = request.app.state

    # 1. BM25 - точные совпадения слов и цифр
    bm25_results = state.bm25.get_top_n(tokenize(req.question), state.chunks, n=req.fetch_k)

    # 2. ChromaDB - семантика
    query_vector = get_embedding(req.question)
    chroma_raw = state.collection.query(query_embeddings=[query_vector], n_results=req.fetch_k)
    vector_results = chroma_raw["documents"][0]

    # 3. Объединение без дублей с сохранением порядка
    candidates: list[str] = []
    for chunk in vector_results + bm25_results:
        if chunk not in candidates:
            candidates.append(chunk)

    # 4. Cross-Encoder оставляет самые релевантные
    return rerank_chunks(req.question, candidates, top_n=req.top_n)


# ---------------------------------------------------------------
# Эндпоинты
# ---------------------------------------------------------------
@app.get("/health", response_model=HealthResponse, tags=["service"])
def health(request: Request):
    """Проверка, что сервис жив и база подключена."""
    state = request.app.state
    return HealthResponse(
        status="ok",
        chunks_in_file=len(state.chunks),
        chunks_in_db=state.collection.count(),
    )


@app.post("/search", response_model=SearchResponse, tags=["rag"])
def search(req: QuestionRequest, request: Request):
    """Только поиск: возвращает релевантные куски правил, без вызова LLM."""
    try:
        return SearchResponse(chunks=retrieve(request, req))
    except Exception:
        logger.exception("Ошибка поиска")
        raise HTTPException(status_code=502, detail="Ошибка при поиске (эмбеддинги или база)")


@app.post("/ask", response_model=AnswerResponse, tags=["rag"])
def ask(req: QuestionRequest, request: Request):
    """Полный RAG: поиск -> reranker -> ответ Gemini + использованные источники."""
    try:
        chunks = retrieve(request, req)
    except Exception:
        logger.exception("Ошибка поиска")
        raise HTTPException(status_code=502, detail="Ошибка при поиске (эмбеддинги или база)")

    if not chunks:
        raise HTTPException(status_code=404, detail="Подходящих фрагментов в правилах не найдено")

    context_text = "\n\n--- ВЫРЕЗКА ИЗ ДОКУМЕНТА ---\n\n".join(chunks)
    prompt = f"""Ответь на вопрос пользователя, используя ТОЛЬКО следующий контекст.

Контекст:
{context_text}

Вопрос: {req.question}"""

    try:
        answer = generate_answer(prompt)
    except Exception:
        logger.exception("Ошибка Gemini")
        raise HTTPException(status_code=502, detail="Ошибка при обращении к Gemini")

    return AnswerResponse(answer=answer, sources=chunks)