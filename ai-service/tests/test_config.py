import pytest
from pydantic import ValidationError

from app.config import DEFAULT_QUERY_INSTRUCTION, Settings


def make(**overrides):
    # _env_file=None: тесты не читают настоящий .env с секретами
    return Settings(_env_file=None, database_url="postgresql://u:p@h/db", GIGACHAT_CREDENTIALS="key", **overrides)


def test_defaults_use_cloudru_embeddings_with_auto_dimension():
    settings = make()
    assert settings.embedding_provider == "cloudru"
    assert settings.cloud_embedding_model == "ai-sage/Giga-Embeddings-instruct-480M"
    assert settings.cloud_base_url == "https://foundation-models.api.cloud.ru/v1"
    assert settings.embedding_dim == 0
    assert settings.embedding_query_instruction == DEFAULT_QUERY_INSTRUCTION


@pytest.mark.parametrize("raw", ["", "   "])
def test_empty_embedding_dim_means_auto(raw):
    assert make(embedding_dim=raw).embedding_dim == 0


def test_provider_is_validated_and_normalized():
    assert make(embedding_provider=" GigaChat ").embedding_provider == "gigachat"
    with pytest.raises(ValidationError):
        make(embedding_provider="gemini")


def test_chat_defaults_to_cloudru_and_gigachat_key_is_optional():
    settings = Settings(_env_file=None, database_url="postgresql://u:p@h/db")
    assert settings.llm_provider == "cloudru"
    assert settings.cloud_chat_model == ""
    assert settings.gigachat_credentials == ""
    assert make(llm_provider="GigaChat").llm_provider == "gigachat"
    with pytest.raises(ValidationError):
        make(llm_provider="openai")


def test_cloud_key_accepts_both_names():
    assert make(CLOUD_API_KEY="abc").cloud_api_key == "abc"
    assert make(CLOUDRU_API_KEY="xyz").cloud_api_key == "xyz"
