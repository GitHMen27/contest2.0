"""Чистые функции для подсчёта метрик evals. Без сети и без базы, поэтому легко проверяются тестами."""
from __future__ import annotations

import re
from typing import Any, Iterable

_CITATION = re.compile(r"\[(\d+)\]")


def normalize(text: str) -> str:
    """Нижний регистр, ё -> е, одинарные пробелы: чтобы сравнение не зависело от мелочей оформления."""
    return re.sub(r"\s+", " ", text.lower().replace("ё", "е")).strip()


def answer_matches(text: str, groups: list[list[str]]) -> bool:
    """Ответ верный, если в каждой группе нашёлся хотя бы один вариант. Пустые группы = нечего проверять."""
    normalized = normalize(text)
    return all(any(normalize(option) in normalized for option in group) for group in groups)


def _matches(hit: dict[str, Any], expected: Iterable[dict[str, Any]], with_section: bool) -> bool:
    doc = normalize(hit.get("doc", ""))
    section = normalize(hit.get("section", ""))
    for item in expected:
        if normalize(item["doc"]) != doc:
            continue
        if not with_section or not item.get("section") or normalize(item["section"]) == section:
            return True
    return False


def doc_rank(hits: list[dict[str, Any]], expected: list[dict[str, Any]]) -> int | None:
    """Место (с 1) первого результата из нужного документа или None, если его нет в выдаче."""
    for position, hit in enumerate(hits, start=1):
        if _matches(hit, expected, with_section=False):
            return position
    return None


def section_rank(hits: list[dict[str, Any]], expected: list[dict[str, Any]]) -> int | None:
    """То же, но результат должен быть из нужного раздела (строже, чем документ)."""
    for position, hit in enumerate(hits, start=1):
        if _matches(hit, expected, with_section=True):
            return position
    return None


def reciprocal_rank(rank: int | None) -> float:
    return 1.0 / rank if rank else 0.0


def hit_rate(ranks: list[int | None], k: int) -> float:
    """Доля вопросов, у которых нужный результат оказался в первых k."""
    if not ranks:
        return 0.0
    return sum(1 for rank in ranks if rank is not None and rank <= k) / len(ranks)


def summarize_retrieval(doc_ranks: list[int | None], section_ranks: list[int | None]) -> dict[str, float]:
    return {
        "questions": len(doc_ranks),
        "doc_hit@1": hit_rate(doc_ranks, 1),
        "doc_hit@3": hit_rate(doc_ranks, 3),
        "doc_hit@4": hit_rate(doc_ranks, 4),
        "section_hit@1": hit_rate(section_ranks, 1),
        "section_hit@4": hit_rate(section_ranks, 4),
        "mrr": (sum(reciprocal_rank(rank) for rank in doc_ranks) / len(doc_ranks)) if doc_ranks else 0.0,
    }


def citations(text: str) -> list[int]:
    """Номера источников, на которые ссылается ответ: [1], [2]."""
    return [int(number) for number in _CITATION.findall(text)]


def citations_valid(text: str, sources_count: int) -> bool:
    """Есть хотя бы одна ссылка, и все ссылки указывают на реально возвращённые источники."""
    numbers = citations(text)
    return bool(numbers) and all(1 <= number <= sources_count for number in numbers)


def percent(value: float) -> str:
    return f"{value * 100:.0f}%"
