"""Проверяет сам набор вопросов для evals и функции подсчёта метрик (без сети и без базы)."""
import json
import re
import sys
from pathlib import Path

import pytest

CONTEST_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(CONTEST_ROOT / "evals"))

import scoring  # noqa: E402

DATASET = CONTEST_ROOT / "evals" / "dataset.json"
CORPUS = CONTEST_ROOT / "ai-service" / "docs-corpus"


def _corpus_sections() -> dict[str, set[str]]:
    """{название документа: {названия разделов}} по заголовкам # и ## в .md файлах корпуса."""
    result: dict[str, set[str]] = {}
    for path in sorted(CORPUS.glob("*.md")):
        title, sections = None, set()
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.startswith("## "):
                sections.add(line[3:].strip())
            elif line.startswith("# ") and title is None:
                title = line[2:].strip()
        if title:
            result[title] = sections
    return result


@pytest.fixture(scope="module")
def questions():
    return json.loads(DATASET.read_text(encoding="utf-8"))["questions"]


# --- набор вопросов -------------------------------------------------------------------------------
def test_ids_are_unique(questions):
    ids = [q["id"] for q in questions]
    assert len(ids) == len(set(ids))


def test_dataset_has_enough_of_both_kinds(questions):
    assert sum(q["answerable"] for q in questions) >= 30
    assert sum(not q["answerable"] for q in questions) >= 8


def test_every_corpus_document_is_covered(questions):
    covered = {e["doc"] for q in questions if q["answerable"] for e in q["expected"]}
    assert covered == set(_corpus_sections())


def test_expected_points_to_real_documents_and_sections(questions):
    corpus = _corpus_sections()
    for q in questions:
        if not q["answerable"]:
            continue
        assert q["expected"], q["id"]
        for expected in q["expected"]:
            assert expected["doc"] in corpus, f"{q['id']}: нет документа {expected['doc']!r}"
            assert expected["section"] in corpus[expected["doc"]], f"{q['id']}: нет раздела {expected['section']!r}"


def test_answerable_questions_have_checkable_answers(questions):
    for q in questions:
        if q["answerable"]:
            assert q["must_contain"] and all(group for group in q["must_contain"]), q["id"]
        else:
            assert "expected" not in q and "must_contain" not in q, q["id"]


# --- подсчёт метрик -------------------------------------------------------------------------------
def test_normalize_ignores_case_yo_and_spaces():
    assert scoring.normalize("  Ёлка   ВЕЛИКА ") == "елка велика"


def test_answer_matches_requires_every_group_but_any_option():
    text = "Перерыв не менее 45 минут после 4,5 часа управления."
    assert scoring.answer_matches(text, [["4,5", "4.5"], ["45"]])
    assert not scoring.answer_matches(text, [["4,5"], ["90"]])
    assert scoring.answer_matches(text, [])


def test_answer_matches_is_case_insensitive():
    assert scoring.answer_matches("Диспетчер ПОДТВЕРЖДАЕТ приоритет", [["подтвержд"]])


HITS = [
    {"doc": "Нормы загрузки транспорта", "section": "Пломбирование"},
    {"doc": "Приоритетные рейсы", "section": "Маршрут"},
    {"doc": "Эскалация инцидентов", "section": "Фиксация"},
]


def test_doc_rank_and_section_rank():
    expected = [{"doc": "Эскалация инцидентов", "section": "Уровни эскалации"}]
    assert scoring.doc_rank(HITS, expected) == 3          # документ нашёлся
    assert scoring.section_rank(HITS, expected) is None   # но раздел другой
    assert scoring.section_rank(HITS, [{"doc": "Приоритетные рейсы", "section": "маршрут"}]) == 2


def test_any_of_several_expected_places_counts():
    expected = [{"doc": "Нет такого", "section": "X"}, {"doc": "Нормы загрузки транспорта", "section": "Пломбирование"}]
    assert scoring.doc_rank(HITS, expected) == 1


def test_missing_document_gives_none():
    assert scoring.doc_rank(HITS, [{"doc": "Другое", "section": "X"}]) is None


def test_summary_metrics():
    summary = scoring.summarize_retrieval([1, 2, None, 5], [1, None, None, None])
    assert summary["questions"] == 4
    assert summary["doc_hit@1"] == pytest.approx(0.25)
    assert summary["doc_hit@4"] == pytest.approx(0.5)
    assert summary["section_hit@1"] == pytest.approx(0.25)
    assert summary["mrr"] == pytest.approx((1 + 0.5 + 0 + 0.2) / 4)


def test_summary_of_empty_list_does_not_crash():
    assert scoring.summarize_retrieval([], [])["mrr"] == 0.0


def test_citations_are_extracted_and_validated():
    text = "Нужен перерыв [1]. Смена водителя [2]."
    assert scoring.citations(text) == [1, 2]
    assert scoring.citations_valid(text, 2)
    assert not scoring.citations_valid(text, 1)            # ссылка на несуществующий источник
    assert not scoring.citations_valid("Без ссылок.", 3)   # ссылок нет вовсе


def test_percent_format():
    assert scoring.percent(0.5) == "50%"
    assert scoring.percent(1.0) == "100%"
