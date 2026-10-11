"""Получение векторов через Gemini API.

Что здесь важно:
1. output_dimensionality задаём явно (768), иначе модель вернёт 3072 и они не влезут в vector(768).
2. Вектор нормализуем (длина = 1): после усечения размерности модель этого сама не делает,
   а для косинусного сравнения единичная длина обязательна.
3. Тексты отправляем пачками, а не по одному (быстрее и дешевле по числу запросов).
4. Проверяем, что число векторов равно числу текстов. Если модель вернула один «склеенный» вектор
   на всю пачку, откатываемся на запросы по одному тексту.
"""
from __future__ import annotations

import time

import numpy as np
from google import genai
from google.genai import types

from app.config import get_settings

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=get_settings().gemini_api_key)
    return _client


def _normalize(values: list[float]) -> list[float]:
    arr = np.asarray(values, dtype=np.float32)
    norm = float(np.linalg.norm(arr))
    return (arr / norm).tolist() if norm > 0 else arr.tolist()


def _embed_call(contents: str | list[str]) -> list[list[float]]:
    """Один вызов API с тремя попытками (лимиты и сетевые сбои бывают)."""
    settings = get_settings()
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            response = _get_client().models.embed_content(
                model=settings.embedding_model,
                contents=contents,
                config=types.EmbedContentConfig(output_dimensionality=settings.embedding_dim),
            )
            return [_normalize(e.values) for e in response.embeddings]
        except Exception as error:  # noqa: BLE001: тут нужна любая ошибка API
            last_error = error
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Не удалось получить эмбеддинг после 3 попыток: {last_error}") from last_error


def embed_texts(texts: list[str], batch_size: int = 50) -> list[list[float]]:
    """Эмбеддинги для списка текстов (в том же порядке)."""
    vectors: list[list[float]] = []
    for start in range(0, len(texts), batch_size):
        batch = texts[start:start + batch_size]
        result = _embed_call(batch)
        if len(result) != len(batch):
            result = [_embed_call(text)[0] for text in batch]
        vectors.extend(result)
    return vectors


def embed_query(text: str) -> list[float]:
    """Эмбеддинг одного вопроса пользователя."""
    return embed_texts([text])[0]
