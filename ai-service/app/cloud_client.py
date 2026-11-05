"""Единственное место, где создаётся клиент Cloud.ru Foundation Models.

Это OpenAI-совместимый API, поэтому используем обычную библиотеку openai с другим base_url.
Один клиент обслуживает и эмбеддинги, и чат: ключ и адрес у них общие.
"""
from __future__ import annotations

from typing import Any

_client: Any = None


def get_cloud_client():
    global _client
    if _client is None:
        from app.config import get_settings

        settings = get_settings()
        if not settings.cloud_api_key:
            raise RuntimeError(
                "Не задан CLOUD_API_KEY. Создай ключ в Cloud.ru (Foundation Models -> API-ключи) и впиши в .env: CLOUD_API_KEY=..."
            )
        from openai import OpenAI

        _client = OpenAI(
            api_key=settings.cloud_api_key,
            base_url=settings.cloud_base_url,
            timeout=settings.cloud_timeout,
            max_retries=3,  # библиотека сама повторяет запрос при 429, 5xx и обрывах связи
        )
    return _client


def close_cloud_client() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
