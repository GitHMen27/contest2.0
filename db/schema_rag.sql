-- Схема RAG для Neon (Postgres + pgvector).
-- Лучше создавать через:  python -m app.setup_db  (он подставляет размер вектора из EMBEDDING_DIM).
-- Этот файл нужен как документация и для ручного запуска в SQL Editor нужной ветки Neon.
-- Размер вектора (1024) должен совпадать с моделью Embeddings GigaChat и с EMBEDDING_DIM в .env.
-- Таблицы рейсов и хабов (hubs и др.) создаются отдельным dump.sql.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS doc_chunks (
  id           BIGSERIAL PRIMARY KEY,
  doc          TEXT NOT NULL,
  section      TEXT,
  content      TEXT NOT NULL,
  content_hash TEXT UNIQUE NOT NULL,
  embedding    vector(1024) NOT NULL,
  tsv          tsvector GENERATED ALWAYS AS (to_tsvector('russian', content)) STORED
);

CREATE INDEX IF NOT EXISTS doc_chunks_embedding_idx
  ON doc_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS doc_chunks_tsv_idx
  ON doc_chunks USING gin (tsv);
