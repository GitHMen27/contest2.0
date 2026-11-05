from types import SimpleNamespace

import pytest

from app import embeddings


class FakeEmbeddingsApi:
    """Подделка client.embeddings: возвращает вектора в обратном порядке, как это может сделать реальный API."""

    def __init__(self, fail_with: Exception | None = None, drop_one: bool = False):
        self.calls: list[tuple[str, list[str]]] = []
        self.fail_with = fail_with
        self.drop_one = drop_one

    def create(self, model, input):
        self.calls.append((model, list(input)))
        if self.fail_with:
            raise self.fail_with
        items = [SimpleNamespace(index=i, embedding=[float(i), 1.0]) for i in range(len(input))]
        if self.drop_one:
            items = items[:-1]
        return SimpleNamespace(data=list(reversed(items)))


@pytest.fixture
def fake_cloud(monkeypatch):
    api = FakeEmbeddingsApi()
    settings = SimpleNamespace(
        embedding_provider="cloudru", cloud_embedding_model="test-model", embedding_query_instruction="Найди ответ"
    )
    monkeypatch.setattr("app.config.get_settings", lambda: settings)
    monkeypatch.setattr(embeddings, "_get_cloud_client", lambda: SimpleNamespace(embeddings=api))
    monkeypatch.setattr(embeddings, "_dim_cache", None)
    return api


def test_format_query_with_instruction():
    assert embeddings.format_query("вопрос", "Найди ответ") == "Instruct: Найди ответ\nQuery: вопрос"


@pytest.mark.parametrize("instruction", ["", "   ", None])
def test_format_query_without_instruction_is_unchanged(instruction):
    assert embeddings.format_query("вопрос", instruction) == "вопрос"


def test_embed_texts_batches_sorts_and_normalizes(fake_cloud):
    vectors = embeddings.embed_texts(["a", "b", "c"], batch_size=2)
    assert [len(call[1]) for call in fake_cloud.calls] == [2, 1]
    assert all(call[0] == "test-model" for call in fake_cloud.calls)
    assert len(vectors) == 3
    # порядок восстановлен по index: у первого вектора x=0, у второго x>0
    assert vectors[0][0] == pytest.approx(0.0)
    assert vectors[1][0] > 0
    for vector in vectors:
        assert sum(v * v for v in vector) == pytest.approx(1.0)


def test_embed_texts_empty_list_makes_no_requests(fake_cloud):
    assert embeddings.embed_texts([]) == []
    assert fake_cloud.calls == []


def test_embed_query_adds_instruction_but_documents_do_not(fake_cloud):
    embeddings.embed_query("сколько отдыхать?")
    assert fake_cloud.calls[-1][1] == ["Instruct: Найди ответ\nQuery: сколько отдыхать?"]
    embeddings.embed_texts(["текст документа"])
    assert fake_cloud.calls[-1][1] == ["текст документа"]


def test_wrong_vector_count_is_an_error(fake_cloud):
    fake_cloud.drop_one = True
    with pytest.raises(RuntimeError, match="векторов"):
        embeddings.embed_texts(["a", "b"])


def test_api_error_becomes_readable_message(fake_cloud):
    fake_cloud.fail_with = Exception("401 Unauthorized")
    with pytest.raises(RuntimeError, match="CLOUD_API_KEY"):
        embeddings.embed_texts(["a"])


def test_embedding_dim_is_detected_once(fake_cloud):
    assert embeddings.get_embedding_dim() == 2
    assert embeddings.get_embedding_dim() == 2
    assert len(fake_cloud.calls) == 1
