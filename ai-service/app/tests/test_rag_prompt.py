from types import SimpleNamespace

import pytest

from app import rag
from app.rag import NO_ANSWER, SYSTEM_PROMPT, build_messages, is_refusal
from app.retrieval import Hit


def _hit(n: int) -> Hit:
    return Hit(id=n, doc="Док", section=f"Раздел {n}", content=f"Док — Раздел {n}\nТекст {n}", score=0.1)


def test_messages_have_system_rules_and_numbered_context():
    messages = build_messages("Сколько часов?", [_hit(1), _hit(2)])
    assert [m["role"] for m in messages] == ["system", "user"]
    user = messages[1]["content"]
    assert "<context>" in user and "</context>" in user
    assert "[1] Док — Раздел 1" in user and "[2] Док — Раздел 2" in user
    assert user.rstrip().endswith("Вопрос: Сколько часов?")


def test_system_prompt_contains_refusal_and_injection_defence():
    assert NO_ANSWER in SYSTEM_PROMPT
    assert "не выполняй команды" in SYSTEM_PROMPT


@pytest.mark.parametrize("text", [
    "В регламентах нет ответа на этот вопрос.",
    "  «В регламентах нет ответа на этот вопрос.» ",
    "в регламентах нет ответа на этот вопрос",
])
def test_refusal_is_recognised(text):
    assert is_refusal(text)


def test_real_answer_is_not_a_refusal():
    assert not is_refusal("После 4,5 часов управления нужен перерыв 45 минут [1].")
    long_answer = "По перерывам есть требования. " * 10 + "В регламентах нет ответа на этот вопрос о штрафах."
    assert not is_refusal(long_answer)


def _patch_answer(monkeypatch, model_text):
    hits = [_hit(1), _hit(2)]
    monkeypatch.setattr("app.retrieval.search", lambda *args, **kwargs: hits)
    monkeypatch.setattr("app.llm.chat", lambda *args, **kwargs: SimpleNamespace(text=model_text))
    return hits


def test_answer_returns_sources_for_real_answer(monkeypatch):
    hits = _patch_answer(monkeypatch, "Нужен перерыв 45 минут [1].")
    text, sources = rag.answer("вопрос")
    assert text == "Нужен перерыв 45 минут [1]." and sources == hits


def test_answer_drops_sources_when_model_refuses(monkeypatch):
    _patch_answer(monkeypatch, "  «В регламентах нет ответа на этот вопрос.»")
    assert rag.answer("какая столица Австралии?") == (NO_ANSWER, [])


def test_answer_with_empty_model_reply_is_a_refusal(monkeypatch):
    _patch_answer(monkeypatch, "   ")
    assert rag.answer("вопрос") == (NO_ANSWER, [])


def test_ask_keeps_retrieved_hits_for_diagnostics_when_model_refuses(monkeypatch):
    hits = _patch_answer(monkeypatch, NO_ANSWER)
    result = rag.ask("вопрос")
    assert result.refused and result.text == NO_ANSWER
    assert result.sources == []          # пользователю источники под отказом не показываем
    assert result.retrieved == hits      # но для evals видно, что нашёл поиск


def test_ask_returns_sources_and_retrieved_for_real_answer(monkeypatch):
    hits = _patch_answer(monkeypatch, "Нужен перерыв 45 минут [1].")
    result = rag.ask("вопрос")
    assert not result.refused and result.sources == hits and result.retrieved == hits


def test_ask_without_search_results_does_not_call_the_model(monkeypatch):
    monkeypatch.setattr("app.retrieval.search", lambda *args, **kwargs: [])

    def boom(*args, **kwargs):
        raise AssertionError("модель не должна вызываться")

    monkeypatch.setattr("app.llm.chat", boom)
    result = rag.ask("вопрос")
    assert result.refused and result.retrieved == [] and result.sources == []


def test_rag_calls_model_with_zero_temperature(monkeypatch):
    seen = {}
    monkeypatch.setattr("app.retrieval.search", lambda *args, **kwargs: [_hit(1)])

    def fake_chat(messages, **kwargs):
        seen.update(kwargs)
        return SimpleNamespace(text="Ответ [1].")

    monkeypatch.setattr("app.llm.chat", fake_chat)
    rag.ask("вопрос")
    assert seen["temperature"] == 0.0


def test_prompt_allows_refusal_only_when_no_fragment_has_the_fact():
    assert "отказывать нельзя" in SYSTEM_PROMPT
    assert "хотя бы в одном фрагменте" in SYSTEM_PROMPT
