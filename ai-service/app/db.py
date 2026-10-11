"""Подключение к Postgres (Neon) через пул соединений.

Пул нужен, чтобы не открывать новое соединение на каждый запрос к API.
register_vector учит psycopg передавать и читать тип vector (из расширения pgvector).
"""
from __future__ import annotations

from psycopg_pool import ConnectionPool
from pgvector.psycopg import register_vector

from app.config import get_settings

_pool: ConnectionPool | None = None


def _configure(conn) -> None:
    register_vector(conn)
    conn.commit()  # после настройки соединение должно быть «свободным» (вне транзакции)


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            get_settings().database_url,
            min_size=1,
            max_size=5,
            configure=_configure,
            check=ConnectionPool.check_connection,  # Neon усыпляет соединения: проверяем перед выдачей
            open=False,
        )
        _pool.open()
    return _pool


def connection():
    """Использование: with connection() as conn: conn.execute(...). Коммит в конце блока автоматический."""
    return get_pool().connection()


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None
