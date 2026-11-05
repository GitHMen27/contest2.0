"""Диагностика эмбеддингов (Cloud.ru Foundation Models): ключ, размер вектора, качество поиска, совпадение с базой.

Запуск из папки ai-service/ (с активированным .venv):
    python check_embeddings.py

Ключи и пароли в вывод не попадают.
"""
from __future__ import annotations

import math
import os
import sys
import time
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parent / ".env"
FAILED: list[str] = []

DOCS = [
    "Водитель обязан сделать перерыв не менее 45 минут после 4,5 часов управления транспортным средством.",
    "Если загрузка распределительного центра превышает 90%, ему присваивается статус critical.",
    "Пломба на кузове проверяется при приёмке груза и фиксируется в акте.",
]
QUESTION = "Сколько нужно отдыхать водителю за рулём?"


def ok(text: str) -> None:
    print(f"  OK   {text}")


def fail(step: str, text: str) -> None:
    FAILED.append(step)
    print(f"  FAIL {text}")


def env_file_value(name: str) -> str | None:
    if not ENV_PATH.exists():
        return None
    for line in ENV_PATH.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            if key.strip().upper() == name:
                return value.strip().strip('"').strip("'")
    return None


def dot(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def main() -> int:
    print("Шаг 1. Ключ Cloud.ru")
    print(f"  файл .env: {ENV_PATH} ({'есть' if ENV_PATH.exists() else 'НЕТ ФАЙЛА'})")
    for name in ("CLOUD_API_KEY", "CLOUDRU_API_KEY"):
        env_value, file_value = os.environ.get(name), env_file_value(name)
        if env_value and file_value and env_value != file_value:
            print(f"  ВНИМАНИЕ: {name} задана ещё и в системе/терминале и отличается от .env. "
                  "Приложение берёт значение из ОКРУЖЕНИЯ, поэтому новый ключ не применяется.")
    if not (os.environ.get("CLOUD_API_KEY") or os.environ.get("CLOUDRU_API_KEY")
            or env_file_value("CLOUD_API_KEY") or env_file_value("CLOUDRU_API_KEY")):
        fail("1", "не найден CLOUD_API_KEY. Добавь в .env строку CLOUD_API_KEY=твой_ключ")
        return 1
    ok("переменная с ключом есть")

    print("Шаг 2. Настройки")
    try:
        from app.config import get_settings
        settings = get_settings()
    except Exception as error:  # noqa: BLE001
        fail("2", f"{type(error).__name__}: {error}")
        return 1
    if settings.embedding_provider != "cloudru":
        print(f"  заметка: EMBEDDING_PROVIDER={settings.embedding_provider}. Этот скрипт проверяет cloudru; "
              "для GigaChat запусти check_gigachat.py")
    ok(f"провайдер={settings.embedding_provider}, модель={settings.cloud_embedding_model}, адрес={settings.cloud_base_url}")
    ok("инструкция для вопросов: " + ("включена" if settings.embedding_query_instruction.strip() else "выключена"))

    from app.embeddings import embed_texts, format_query

    print("Шаг 3. Запрос эмбеддингов")
    try:
        started = time.time()
        vectors = embed_texts(DOCS)
        elapsed = time.time() - started
    except Exception as error:  # noqa: BLE001
        fail("3", str(error))
        return 1
    dim = len(vectors[0])
    ok(f"получено {len(vectors)} вектора, размер {dim}, длина {math.sqrt(dot(vectors[0], vectors[0])):.3f}, {elapsed:.1f} с")
    if settings.embedding_dim and settings.embedding_dim != dim:
        fail("3", f"в .env EMBEDDING_DIM={settings.embedding_dim}, а модель возвращает {dim}. "
                  "Удали EMBEDDING_DIM из .env (размер определяется автоматически)")

    print("Шаг 4. Качество: находит ли вопрос нужный фрагмент (правильный ответ: №1)")
    variants = {"без инструкции": QUESTION}
    instruction = settings.embedding_query_instruction.strip()
    if instruction:
        variants["с инструкцией (как в приложении)"] = format_query(QUESTION, instruction)
    try:
        for label, text in variants.items():
            query_vector = embed_texts([text])[0]
            scores = [dot(query_vector, v) for v in vectors]
            best = max(range(len(scores)), key=scores.__getitem__)
            line = ", ".join(f"№{i + 1}: {s:.3f}" for i, s in enumerate(scores))
            if best == 0:
                ok(f"{label}: {line}")
            else:
                fail("4", f"{label}: лучший фрагмент №{best + 1} ({line})")
    except Exception as error:  # noqa: BLE001
        fail("4", str(error))

    print("Шаг 5. Совпадение с таблицей в базе")
    try:
        import psycopg

        from app.setup_db import DIM_SQL

        with psycopg.connect(settings.database_url, connect_timeout=20) as conn:
            row = conn.execute(DIM_SQL).fetchone()
        if not row:
            print("  таблицы doc_chunks ещё нет: выполни python -m app.setup_db")
        elif row[0] == dim:
            ok(f"размер вектора в таблице ({row[0]}) совпадает с моделью")
        else:
            fail("5", f"в таблице doc_chunks вектор на {row[0]}, а модель возвращает {dim}. "
                      "Выполни: python -m app.setup_db --recreate, затем python -m app.ingest")
    except Exception as error:  # noqa: BLE001
        print(f"  пропущено: база недоступна ({type(error).__name__}). Проверь: python check_db.py")

    print()
    print("ИТОГ:", "всё в порядке" if not FAILED else f"проблемы на шагах: {', '.join(FAILED)}")
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())
