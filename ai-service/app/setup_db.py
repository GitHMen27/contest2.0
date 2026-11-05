"""Создаёт расширение vector и таблицу doc_chunks с нужным размером вектора.

Запуск из папки ai-service/:
    python -m app.setup_db              # создать, если нет (если размер вектора не совпадает, остановится)
    python -m app.setup_db --recreate   # удалить таблицу и создать заново (ВСЕ строки пропадут, потом python -m app.ingest)

Размер вектора определяется автоматически: скрипт делает один пробный запрос к модели эмбеддингов
(Cloud.ru Giga-Embeddings или GigaChat, см. EMBEDDING_PROVIDER). Если в .env задан EMBEDDING_DIM и он не совпадает
с реальным размером, берётся реальный.

Индекс HNSW в pgvector поддерживает векторы до 2000 измерений. Для более длинных (например, 2048) индекс не создаётся:
поиск идёт перебором, он точный и для корпуса из сотен и даже тысяч чанков работает мгновенно.
"""
from __future__ import annotations

import argparse

MAX_DIM = 16000          # предел типа vector в pgvector
MAX_INDEXED_DIM = 2000   # предел индекса HNSW для типа vector


def build_schema_sql(dim: int) -> list[str]:
    """SQL-команды схемы. Размер вектора вставляется в текст команды, поэтому строго проверяем, что это число."""
    if not isinstance(dim, int) or isinstance(dim, bool) or not (1 <= dim <= MAX_DIM):
        raise ValueError(f"Размер вектора должен быть целым числом от 1 до {MAX_DIM}, получено: {dim!r}")
    statements = [
        f"""
        CREATE TABLE IF NOT EXISTS doc_chunks (
          id           BIGSERIAL PRIMARY KEY,
          doc          TEXT NOT NULL,
          section      TEXT,
          content      TEXT NOT NULL,
          content_hash TEXT UNIQUE NOT NULL,
          embedding    vector({dim}) NOT NULL,
          tsv          tsvector GENERATED ALWAYS AS (to_tsvector('russian', content)) STORED
        )""",
    ]
    if dim <= MAX_INDEXED_DIM:
        statements.append(
            "CREATE INDEX IF NOT EXISTS doc_chunks_embedding_idx ON doc_chunks USING hnsw (embedding vector_cosine_ops)"
        )
    statements.append("CREATE INDEX IF NOT EXISTS doc_chunks_tsv_idx ON doc_chunks USING gin (tsv)")
    return statements


DIM_SQL = """
SELECT a.atttypmod
FROM pg_attribute a
WHERE a.attrelid = to_regclass('public.doc_chunks') AND a.attname = 'embedding' AND NOT a.attisdropped
"""


def main() -> None:
    import psycopg

    from app.config import get_settings
    from app.embeddings import get_embedding_dim

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--recreate", action="store_true", help="удалить таблицу doc_chunks и создать заново")
    args = parser.parse_args()

    settings = get_settings()
    print(f"Определяю размер вектора у модели (провайдер: {settings.embedding_provider})...")
    dim = get_embedding_dim()
    if settings.embedding_dim and settings.embedding_dim != dim:
        print(f"Внимание: в .env EMBEDDING_DIM={settings.embedding_dim}, а модель возвращает {dim}. Использую {dim}. "
              "Лучше удалить EMBEDDING_DIM из .env (тогда размер определяется автоматически).")
    print(f"Размер вектора: {dim}")
    statements = build_schema_sql(dim)

    # Прямое подключение без пула: пул вызывает register_vector, а ему нужно, чтобы расширение уже существовало
    with psycopg.connect(settings.database_url, autocommit=True, connect_timeout=20) as conn:
        conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        existing = conn.execute(DIM_SQL).fetchone()
        if existing and existing[0] != dim:
            rows = conn.execute("SELECT count(*) FROM doc_chunks").fetchone()[0]
            if not args.recreate:
                raise SystemExit(
                    f"Таблица doc_chunks уже есть с размером вектора {existing[0]}, а модель возвращает {dim} "
                    f"(строк в таблице: {rows}). Если ты сменил модель эмбеддингов, выполни: python -m app.setup_db --recreate"
                )
        if args.recreate:
            conn.execute("DROP TABLE IF EXISTS doc_chunks")
            print("Таблица doc_chunks удалена.")
        for statement in statements:
            conn.execute(statement)
    note = "" if dim <= MAX_INDEXED_DIM else " (без индекса HNSW: размер больше 2000, поиск перебором)"
    print(f"Готово: doc_chunks с вектором на {dim} измерений{note}. Дальше: python -m app.ingest")


if __name__ == "__main__":
    main()
