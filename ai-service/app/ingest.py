"""Ингест корпуса: docs-corpus/*.md -> чанки -> эмбеддинги -> таблица doc_chunks.

Запуск из папки ai-service/:
    python -m ingest --dry-run   # только показать чанки (без ключей и БД)
    python -m ingest             # реально записать в Postgres

Скрипт можно запускать сколько угодно раз:
  * новые чанки добавляются,
  * неизменившиеся пропускаются (эмбеддинг за них не оплачивается повторно),
  * чанки, которых больше нет в файлах, удаляются.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from app.chunking import load_corpus

DEFAULT_DOCS_DIR = Path(__file__).resolve().parent / "docs-corpus"

INSERT_SQL = """
INSERT INTO doc_chunks (doc, section, content, content_hash, embedding)
VALUES (%s, %s, %s, %s, %s)
ON CONFLICT (content_hash) DO NOTHING
"""


def dry_run() -> None:
    chunks = load_corpus(DEFAULT_DOCS_DIR)
    for i, chunk in enumerate(chunks, 1):
        print(f"--- #{i} | {chunk.doc} | {chunk.section} | {len(chunk.content)} симв.")
        print(chunk.content)
    print(f"\nИтого чанков: {len(chunks)}")


def ingest() -> None:
    import numpy as np  # импорты внутри функции: dry-run не требует ни ключей, ни БД

    from app.config import get_settings
    from app.db import close_pool, connection
    from app.embeddings import embed_texts

    settings = get_settings()
    chunks = load_corpus(settings.docs_dir)
    if not chunks:
        raise SystemExit(f"В {settings.docs_dir} не найдено ни одного .md файла с текстом")

    with connection() as conn:
        existing = {row[0] for row in conn.execute("SELECT content_hash FROM doc_chunks").fetchall()}

    current = {c.content_hash for c in chunks}
    new_chunks = [c for c in chunks if c.content_hash not in existing]
    stale = existing - current
    print(f"В корпусе: {len(chunks)} | новых: {len(new_chunks)} | устаревших к удалению: {len(stale)}")

    vectors = embed_texts([c.content for c in new_chunks]) if new_chunks else []
    for vector in vectors:
        if len(vector) != settings.embedding_dim:
            raise SystemExit(f"Размерность {len(vector)} не равна EMBEDDING_DIM={settings.embedding_dim}")

    with connection() as conn:
        with conn.cursor() as cur:
            if stale:
                cur.execute("DELETE FROM doc_chunks WHERE content_hash = ANY(%s)", (list(stale),))
            rows = [
                (c.doc, c.section, c.content, c.content_hash, np.array(v, dtype=np.float32))
                for c, v in zip(new_chunks, vectors)
            ]
            if rows:
                cur.executemany(INSERT_SQL, rows)
        total = conn.execute("SELECT count(*) FROM doc_chunks").fetchone()[0]
    print(f"Готово. Строк в doc_chunks: {total}")
    close_pool()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="показать чанки, ничего не записывая")
    args = parser.parse_args()
    dry_run() if args.dry_run else ingest()
