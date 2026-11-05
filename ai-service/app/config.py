"""Все настройки в одном месте. Значения берутся из переменных окружения или из файла ai-service/.env."""
from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# ai-service/ (на уровень выше папки app/). Не зависит от того, откуда запущен скрипт.
BASE_DIR = Path(__file__).resolve().parent.parent

# Инструкция для вопросов к модели Giga-Embeddings-instruct (формат из описания модели: «Instruct: ...\nQuery: ...»).
# К документам инструкция не добавляется. Чтобы отключить, задай в .env: EMBEDDING_QUERY_INSTRUCTION=
DEFAULT_QUERY_INSTRUCTION = "Given a question, retrieve passages that answer the question"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    database_url: str

    # --- Чат (ответы модели) --------------------------------------------------------------------
    # cloudru: любая чат-модель из каталога Cloud.ru Foundation Models (тот же ключ CLOUD_API_KEY, что и у эмбеддингов).
    # gigachat: GigaChat API (Сбер), нужен GIGACHAT_CREDENTIALS.
    llm_provider: str = "cloudru"
    cloud_chat_model: str = ""                     # точный id модели; список: python check_chat.py --list

    # --- GigaChat (нужен только при LLM_PROVIDER=gigachat или EMBEDDING_PROVIDER=gigachat) ---------------------
    # Ключ авторизации из личного кабинета Studio (одной строкой, без кавычек)
    gigachat_credentials: str = Field(
        default="",
        validation_alias=AliasChoices("GIGACHAT_CREDENTIALS", "GIGACHAT_AUTH_KEY", "GIGACHAT_API_KEY", "GIGACHAT_KEY"),
    )
    gigachat_scope: str = "GIGACHAT_API_PERS"      # для физических лиц
    gigachat_model: str = "GigaChat-2"             # модель для ответов при LLM_PROVIDER=gigachat (список: python check_gigachat.py)
    gigachat_embedding_model: str = "Embeddings"   # нужна только при EMBEDDING_PROVIDER=gigachat
    gigachat_ca_bundle_file: str = ""              # путь к «Russian Trusted Root CA» (.cer/.crt)
    gigachat_verify_ssl_certs: bool = True         # false только для разработки
    gigachat_base_url: str = ""                    # пусто = адрес по умолчанию из SDK
    gigachat_timeout: float = 60.0

    # --- Эмбеддинги -----------------------------------------------------------------------------
    # cloudru: Giga-Embeddings через Cloud.ru Foundation Models (OpenAI-совместимый API). Основной вариант.
    # gigachat: модель Embeddings из GigaChat API (нужен отдельный платный пакет).
    embedding_provider: str = "cloudru"

    cloud_api_key: str = Field(default="", validation_alias=AliasChoices("CLOUD_API_KEY", "CLOUDRU_API_KEY"))
    cloud_base_url: str = "https://foundation-models.api.cloud.ru/v1"
    cloud_embedding_model: str = "ai-sage/Giga-Embeddings-instruct-480M"
    cloud_timeout: float = 60.0

    embedding_query_instruction: str = DEFAULT_QUERY_INSTRUCTION

    # Размер вектора. 0 или пусто = определить автоматически по ответу модели (рекомендуется).
    # Таблица doc_chunks создаётся с этим размером: python -m app.setup_db
    embedding_dim: int = 0

    # --- API ------------------------------------------------------------------------------------
    cors_origins: str = "http://localhost:3000"    # через запятую
    cors_origin_regex: str = ""                    # необязательно, например https://.*\.vercel\.app для превью-деплоев
    app_api_key: str = Field(default="", validation_alias=AliasChoices("APP_API_KEY"))  # пусто = без ключа (dev)
    rate_limit_per_minute: int = 30

    docs_dir: Path = BASE_DIR / "docs-corpus"

    @field_validator("embedding_dim", mode="before")
    @classmethod
    def _empty_dim_means_auto(cls, value):
        if value is None or (isinstance(value, str) and not value.strip()):
            return 0
        return value

    @field_validator("embedding_provider", "llm_provider")
    @classmethod
    def _check_provider(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in {"cloudru", "gigachat"}:
            raise ValueError("Провайдер должен быть cloudru или gigachat (EMBEDDING_PROVIDER, LLM_PROVIDER)")
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    """Настройки создаются один раз и переиспользуются."""
    return Settings()
