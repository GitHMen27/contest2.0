"""Получение векторов (эмбеддингов) для RAG.

Основной вариант (EMBEDDING_PROVIDER=cloudru): модель Giga-Embeddings через Cloud.ru Foundation Models.
Это OpenAI-совместимый API, поэтому используем обычную библиотеку openai с другим base_url.
Запасной вариант (EMBEDDING_PROVIDER=gigachat): модель Embeddings из GigaChat API.

Что здесь важно:
1. Вектор нормализуем (длина = 1): для косинусного сравнения в pgvector это надёжнее.
2. Тексты отправляем небольшими пачками.
3. Проверяем, что число векторов равно числу текстов.
4. Размер вектора не зашит в код: он определяется по ответу модели (get_embedding_dim).
5. Giga-Embeddings-instruct учится на вопросах с инструкцией: вопросы пользователя отправляем в формате
   «Instruct: ...\\nQuery: ...», а документы (чанки регламентов) без неё. Инструкция задаётся в
   EMBEDDING_QUERY_INSTRUCTION; пустая строка отключает её.
"""
from __future__ import annotations

import math

from app.errors import explain_error

BATCH_SIZE = 16

_dim_cache: int | None = None


def _normalize(values: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in values))
    return [v / norm for v in values] if norm > 0 else list(values)


def format_query(text: str, instruction: str) -> str:
    """Оформляет вопрос для instruct-модели. Без инструкции возвращает текст как есть."""
    instruction = (instruction or "").strip()
    return f"Instruct: {instruction}\nQuery: {text}" if instruction else text


def _get_cloud_client():
    """Клиент Cloud.ru Foundation Models (общий для эмбеддингов и чата)."""
    from app.cloud_client import get_cloud_client

    return get_cloud_client()


def _embed_cloudru(texts: list[str], batch_size: int) -> list[list[float]]:
    from app.config import get_settings

    model = get_settings().cloud_embedding_model
    client = _get_cloud_client()
    vectors: list[list[float]] = []
    for start in range(0, len(texts), batch_size):
        batch = texts[start:start + batch_size]
        try:
            result = client.embeddings.create(model=model, input=batch)
        except Exception as error:  # noqa: BLE001: любое исключение библиотеки превращаем в понятное сообщение
            raise RuntimeError(explain_error(error, provider="cloudru")) from error
        items = sorted(result.data, key=lambda item: getattr(item, "index", 0) or 0)
        if len(items) != len(batch):
            raise RuntimeError(f"Модель вернула {len(items)} векторов на {len(batch)} текстов")
        vectors.extend(_normalize(list(item.embedding)) for item in items)
    return vectors


def _embed_gigachat(texts: list[str], batch_size: int) -> list[list[float]]:
    from app.config import get_settings
    from app.gigachat_client import get_client

    model = get_settings().gigachat_embedding_model
    client = get_client()
    vectors: list[list[float]] = []
    for start in range(0, len(texts), batch_size):
        batch = texts[start:start + batch_size]
        try:
            result = client.embeddings(batch, model=model)
        except Exception as error:  # noqa: BLE001
            raise RuntimeError(explain_error(error)) from error
        items = sorted(result.data, key=lambda item: getattr(item, "index", 0) or 0)
        if len(items) != len(batch):
            raise RuntimeError(f"Модель вернула {len(items)} векторов на {len(batch)} текстов")
        vectors.extend(_normalize(list(item.embedding)) for item in items)
    return vectors


def embed_texts(texts: list[str], batch_size: int = BATCH_SIZE) -> list[list[float]]:
    """Эмбеддинги для списка текстов (в том же порядке). Так кодируются ДОКУМЕНТЫ: без инструкции."""
    from app.config import get_settings

    if not texts:
        return []
    if get_settings().embedding_provider == "gigachat":
        return _embed_gigachat(texts, batch_size)
    return _embed_cloudru(texts, batch_size)


def embed_query(text: str) -> list[float]:
    """Эмбеддинг одного вопроса пользователя (для cloudru с инструкцией, если она задана)."""
    from app.config import get_settings

    settings = get_settings()
    if settings.embedding_provider == "cloudru":
        text = format_query(text, settings.embedding_query_instruction)
    return embed_texts([text])[0]


def get_embedding_dim() -> int:
    """Реальный размер вектора. Определяется одним пробным запросом к модели и запоминается."""
    global _dim_cache
    if _dim_cache is None:
        _dim_cache = len(embed_texts(["проверка размера вектора"])[0])
    return _dim_cache
