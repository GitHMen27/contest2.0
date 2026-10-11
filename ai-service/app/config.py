"""Все настройки в одном месте. Значения берутся из переменных окружения или из файла ai-service/.env."""
from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# ai-service/ (на уровень выше папки app/). Не зависит от того, откуда запущен скрипт.
BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    database_url: str
    # Принимаем оба имени переменной, как делает сам SDK Gemini
    gemini_api_key: str = Field(validation_alias=AliasChoices("GEMINI_API_KEY", "GOOGLE_API_KEY"))

    embedding_model: str = "gemini-embedding-2"
    embedding_dim: int = 768  # должен совпадать с vector(768) в таблице doc_chunks
    llm_model: str = "gemini-3.5-flash-lite"

    docs_dir: Path = BASE_DIR / "docs-corpus"


@lru_cache
def get_settings() -> Settings:
    """Настройки создаются один раз и переиспользуются."""
    return Settings()
