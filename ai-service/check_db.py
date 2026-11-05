"""Диагностика подключения к Neon: проверяет цепочку шаг за шагом и показывает, где именно обрыв.

Запуск из папки ai-service/ (после pip install -r requirements.txt):
    python check_db.py

Пароль в вывод не попадает.
"""
from __future__ import annotations

import os
import socket
import sys
from pathlib import Path
from urllib.parse import urlparse

ENV_PATH = Path(__file__).resolve().parent / ".env"
FAILED: list[str] = []


def read_env_file() -> dict[str, str]:
    values: dict[str, str] = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def mask(url: str) -> str:
    p = urlparse(url)
    user = p.username or "?"
    port = f":{p.port}" if p.port else ""
    query = f"?{p.query}" if p.query else ""
    return f"{p.scheme}://{user}:***@{p.hostname}{port}{p.path}{query}"


def ok(text: str) -> None:
    print(f"  OK   {text}")


def fail(step: str, text: str, hint: str) -> None:
    FAILED.append(step)
    print(f"  FAIL {text}\n       -> {hint}")


def main() -> int:
    print("Шаг 1. Откуда берётся DATABASE_URL")
    file_url = read_env_file().get("DATABASE_URL")
    env_url = os.environ.get("DATABASE_URL")
    print(f"  файл .env: {ENV_PATH} ({'есть' if ENV_PATH.exists() else 'НЕТ ФАЙЛА'})")
    if env_url and file_url and env_url != file_url:
        fail("1", "переменная окружения DATABASE_URL отличается от .env",
             "приложение берёт ПЕРЕМЕННУЮ ОКРУЖЕНИЯ (старую!), а не .env. Удали её из системы/терминала")
    url = env_url or file_url
    if not url:
        fail("1", "DATABASE_URL не найден ни в окружении, ни в .env", "создай ai-service/.env по образцу .env.example")
        return 1
    ok(f"используется: {mask(url)}  (источник: {'переменная окружения' if env_url else '.env'})")

    host = urlparse(url).hostname or ""
    port = urlparse(url).port or 5432
    if "-pooler" in host:
        print("  заметка: это pooled-адрес (PgBouncer). Для начала лучше прямой (Connect -> выключить Connection pooling)")

    print("Шаг 2. DNS: находится ли хост")
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(host, port)}
        ok(f"{host} -> {', '.join(sorted(addresses))}")
    except OSError as error:
        fail("2", f"имя хоста не разрешается: {error}",
             "нет интернета/VPN или хост удалён. Проверь, что строка скопирована из Neon целиком")
        return 1

    print(f"Шаг 3. TCP: доходит ли соединение до {host}:{port}")
    try:
        socket.create_connection((host, port), timeout=10).close()
        ok("порт открыт")
    except OSError as error:
        fail("3", f"соединение не установлено: {error}",
             "порт 5432 заблокирован сетью (колледж, провайдер, фаервол) или endpoint удалён. "
             "Попробуй другую сеть (мобильный интернет) или VPN")
        return 1

    print("Шаг 4. Вход в базу (psycopg, без пула)")
    try:
        import psycopg
    except ImportError:
        fail("4", "psycopg не установлен", "pip install -r requirements.txt в активированном .venv")
        return 1
    try:
        conn = psycopg.connect(url, connect_timeout=20)
    except Exception as error:  # noqa: BLE001
        fail("4", f"{type(error).__name__}: {error}",
             "если про password/authentication: пароль неверный, скопируй строку заново (Neon -> Connect). "
             "Если про endpoint/branch: ветка удалена или строка от другой ветки")
        return 1
    with conn:
        row = conn.execute("SELECT current_database(), current_user, version()").fetchone()
        ok(f"база={row[0]}, пользователь={row[1]}")

        print("Шаг 5. Расширение vector и таблицы (в ЭТОЙ ветке)")
        has_vector = conn.execute("SELECT 1 FROM pg_extension WHERE extname = 'vector'").fetchone()
        if has_vector:
            ok("расширение vector есть")
        else:
            fail("5", "расширения vector НЕТ в этой ветке",
                 "выполни в SQL Editor этой ветки: CREATE EXTENSION IF NOT EXISTS vector;")
        tables = [r[0] for r in conn.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1").fetchall()]
        print(f"  таблицы: {', '.join(tables) if tables else '(пусто)'}")
        if "doc_chunks" in tables:
            count = conn.execute("SELECT count(*) FROM doc_chunks").fetchone()[0]
            ok(f"doc_chunks есть, строк: {count}")
        else:
            fail("5", "таблицы doc_chunks нет", "создай её SQL-скриптом из плана (в новой ветке она не появляется сама)")

    print("Шаг 6. register_vector (то, что вызывает пул при каждом подключении)")
    try:
        from pgvector.psycopg import register_vector
        with psycopg.connect(url, connect_timeout=20) as conn2:
            register_vector(conn2)
        ok("register_vector прошёл")
    except Exception as error:  # noqa: BLE001
        fail("6", f"{type(error).__name__}: {error}",
             "пул считает это ошибкой подключения, молча пробует снова и в итоге даёт PoolTimeout. "
             "Чаще всего причина: нет расширения vector (см. шаг 5)")

    print()
    print("ИТОГ:", "всё в порядке, проблема не в подключении" if not FAILED else f"проблемы на шагах: {', '.join(FAILED)}")
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())
