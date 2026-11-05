"""Гибридный поиск по регламентам: векторы (pgvector) + полнотекстовый поиск Postgres + слияние RRF.

Зачем два поиска:
  * вектор находит по СМЫСЛУ («сколько можно ехать без остановки» -> раздел про время управления),
  * полнотекстовый находит по СЛОВАМ и ЦИФРАМ («700 км», «critical», «пломба»); конфиг 'russian' сам сводит
    «перерыв/перерыва/перерыве» к одной основе.
Результаты двух списков объединяет RRF (Reciprocal Rank Fusion): чем выше чанк в каждом списке, тем больше очков.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

RRF_K = 60
_WORD = re.compile(r"[^\W_]+")  # слова из букв и цифр (без подчёркиваний)

VECTOR_SQL = """
SELECT id, doc, section, content
FROM doc_chunks
ORDER BY embedding <=> %s
LIMIT %s
"""

# Слова соединяем через OR: вопрос обычно длинный, и требовать все слова сразу (AND) значит не найти ничего
FTS_SQL = """
SELECT id, doc, section, content
FROM doc_chunks
WHERE tsv @@ to_tsquery('russian', %s)
ORDER BY ts_rank_cd(tsv, to_tsquery('russian', %s)) DESC
LIMIT %s
"""


@dataclass
class Hit:
    id: int
    doc: str
    section: str
    content: str
    score: float
    via: list[str] = field(default_factory=list)  # какие поиски нашли этот чанк: vector / fts


def build_or_query(text: str) -> str:
    """Превращает вопрос в запрос для to_tsquery: «слово1 | слово2 | ...». Только буквы и цифры, поэтому безопасно."""
    words: list[str] = []
    for word in _WORD.findall(text.lower()):
        keep = len(word) >= 3 or (word.isdigit() and len(word) >= 2)
        if keep and word not in words:
            words.append(word)
    return " | ".join(words)


def rrf_fuse(rankings: dict[str, list[int]], k: int = RRF_K) -> list[tuple[int, float]]:
    """rankings: {'vector': [id, id, ...], 'fts': [...]} (от лучшего к худшему). Возвращает [(id, очки)] по убыванию."""
    scores: dict[int, float] = {}
    first_seen: dict[int, int] = {}
    for ids in rankings.values():
        for rank, item in enumerate(ids, start=1):
            scores[item] = scores.get(item, 0.0) + 1.0 / (k + rank)
            first_seen.setdefault(item, len(first_seen))
    return sorted(scores.items(), key=lambda pair: (-pair[1], first_seen[pair[0]]))


def search(query: str, top_n: int = 4, fetch_k: int = 8) -> list[Hit]:
    """Находит top_n самых подходящих чанков. fetch_k: сколько кандидатов брать из каждого поиска."""
    import numpy as np

    from app.db import connection
    from app.embeddings import embed_query

    vector = np.array(embed_query(query), dtype=np.float32)
    fts_query = build_or_query(query)

    with connection() as conn:
        vector_rows = conn.execute(VECTOR_SQL, (vector, fetch_k)).fetchall()
        fts_rows = conn.execute(FTS_SQL, (fts_query, fts_query, fetch_k)).fetchall() if fts_query else []

    rows = {row[0]: row for row in (*vector_rows, *fts_rows)}
    via: dict[int, list[str]] = {}
    for name, found in (("vector", vector_rows), ("fts", fts_rows)):
        for row in found:
            via.setdefault(row[0], []).append(name)

    fused = rrf_fuse({"vector": [r[0] for r in vector_rows], "fts": [r[0] for r in fts_rows]})
    hits: list[Hit] = []
    for chunk_id, score in fused[:top_n]:
        _, doc, section, content = rows[chunk_id]
        hits.append(Hit(id=chunk_id, doc=doc, section=section or "", content=content, score=round(score, 5), via=via[chunk_id]))
    return hits
