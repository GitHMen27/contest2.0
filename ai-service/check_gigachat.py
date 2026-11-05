"""Диагностика GigaChat API (Сбер) шаг за шагом: ключ, сертификат, модель, функции.

Нужен только если LLM_PROVIDER=gigachat или EMBEDDING_PROVIDER=gigachat. Для Cloud.ru используй
  python check_chat.py        (чат)
  python check_embeddings.py  (эмбеддинги)

Запуск из папки ai-service/ (с активированным .venv):
    python check_gigachat.py

Ключи и пароли в вывод не попадают.
"""
from __future__ import annotations

import base64
import math
import os
import sys
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parent / ".env"
WATCHED = [
    "DATABASE_URL", "GIGACHAT_CREDENTIALS", "GIGACHAT_AUTH_KEY", "GIGACHAT_API_KEY", "GIGACHAT_KEY",
    "GIGACHAT_SCOPE", "GIGACHAT_MODEL", "GIGACHAT_EMBEDDING_MODEL", "GIGACHAT_CA_BUNDLE_FILE",
    "GIGACHAT_VERIFY_SSL_CERTS", "EMBEDDING_DIM", "EMBEDDING_PROVIDER", "CLOUD_API_KEY", "CLOUDRU_API_KEY",
    "CLOUD_BASE_URL", "CLOUD_EMBEDDING_MODEL", "EMBEDDING_QUERY_INSTRUCTION",
]
FAILED: list[str] = []


def ok(text: str) -> None:
    print(f"  OK   {text}")


def fail(step: str, text: str) -> None:
    FAILED.append(step)
    print(f"  FAIL {text}")


def env_names() -> set[str]:
    names = {name.upper() for name in os.environ}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                names.add(line.split("=", 1)[0].strip().upper())
    return names


def env_file_values() -> dict[str, str]:
    """Значения из .env. Нужны только для сравнения с переменными окружения, на экран не выводятся."""
    values: dict[str, str] = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                values[key.strip().upper()] = value.strip().strip('"').strip("'")
    return values


def credential_problems(value: str) -> list[str]:
    """Проверяет форму ключа авторизации, не показывая сам ключ.

    Ключ авторизации из Studio это base64 от строки «client_id:client_secret». Частые ошибки: вставили Client Secret
    вместо ключа, оставили слово Basic, кавычки или пробелы/перенос строки внутри.
    """
    problems: list[str] = []
    raw = value
    if raw != raw.strip() or any(ch.isspace() for ch in raw.strip()):
        problems.append("в ключе есть пробелы или перенос строки: он должен быть одной строкой без пробелов")
    if raw.strip().lower().startswith("basic "):
        problems.append("в начале ключа лежит слово Basic: его нужно убрать")
    if raw.strip()[:1] in {'"', "'"} or raw.strip()[-1:] in {'"', "'"}:
        problems.append("в ключе остались кавычки")
    cleaned = raw.strip().strip('"').strip("'")
    if cleaned.lower().startswith("basic "):
        cleaned = cleaned[6:].strip()
    if len(cleaned) == 36 and cleaned.count("-") == 4:
        problems.append("это похоже на Client ID или Client Secret (UUID), а нужен «Ключ авторизации» из раздела API-ключи")
        return problems
    try:
        decoded = base64.b64decode(cleaned, validate=True).decode("utf-8")
        if ":" not in decoded:
            problems.append("ключ раскодировался без разделителя «:»; это не ключ авторизации")
    except Exception:  # noqa: BLE001
        problems.append("значение не является base64-строкой; скорее всего, скопирован не ключ авторизации или он обрезан")
    return problems


def probe_scopes(settings) -> str | None:
    """Пробует получить токен с каждым из известных scope. Возвращает подходящий или None."""
    from gigachat import GigaChat

    working: str | None = None
    for scope in ("GIGACHAT_API_PERS", "GIGACHAT_API_B2B", "GIGACHAT_API_CORP"):
        options: dict = {
            "credentials": settings.gigachat_credentials,
            "scope": scope,
            "verify_ssl_certs": settings.gigachat_verify_ssl_certs,
            "timeout": 20,
            "max_retries": 0,
        }
        if settings.gigachat_ca_bundle_file:
            options["ca_bundle_file"] = settings.gigachat_ca_bundle_file
        try:
            with GigaChat(**options) as probe:
                probe.get_token()
            print(f"       scope {scope}: токен получен")
            working = working or scope
        except Exception as error:  # noqa: BLE001
            print(f"       scope {scope}: {type(error).__name__}")
    return working


def main() -> int:
    print("Шаг 1. Какие переменные заданы (значения не показываются)")
    present = env_names()
    print(f"  файл .env: {ENV_PATH} ({'есть' if ENV_PATH.exists() else 'НЕТ ФАЙЛА'})")
    print("  найдены: " + (", ".join(n for n in WATCHED if n in present) or "ничего"))
    file_values = env_file_values()
    overridden = [n for n in WATCHED if n in file_values and n in {k.upper() for k in os.environ}
                  and os.environ.get(n, os.environ.get(n.lower())) != file_values[n]]
    if overridden:
        print("  ВНИМАНИЕ: эти переменные заданы ещё и в системе/терминале, и значения отличаются от .env: "
              + ", ".join(overridden))
        print("       Приложение берёт значение из ОКРУЖЕНИЯ, а не из .env, поэтому новый ключ не применяется.")
        print("       В PowerShell: Remove-Item Env:\\ИМЯ_ПЕРЕМЕННОЙ (и удали её из системных переменных Windows, если она там есть).")
    if not present & {"GIGACHAT_CREDENTIALS", "GIGACHAT_AUTH_KEY", "GIGACHAT_API_KEY", "GIGACHAT_KEY"}:
        fail("1", "не найдено имя переменной с ключом. Добавь в .env строку GIGACHAT_CREDENTIALS=твой_ключ_авторизации")
        return 1
    ok("переменная с ключом есть")

    print("Шаг 2. Загрузка настроек")
    try:
        from app.config import get_settings
        settings = get_settings()
    except Exception as error:  # noqa: BLE001
        fail("2", f"{type(error).__name__}: {error}")
        return 1
    ok(f"scope={settings.gigachat_scope}, модель={settings.gigachat_model}, эмбеддинги={settings.gigachat_embedding_model}, "
       f"проверка сертификатов={settings.gigachat_verify_ssl_certs}, свой сертификат={'указан' if settings.gigachat_ca_bundle_file else 'нет'}")

    from app.errors import explain_error
    from app.gigachat_client import get_client

    print("Шаг 3. Токен доступа (проверяет ключ и сертификат)")
    problems = credential_problems(settings.gigachat_credentials)
    for problem in problems:
        print(f"  ПОДОЗРЕНИЕ: {problem}")
    if not problems:
        ok("форма ключа авторизации выглядит правильно")
    client = get_client()
    try:
        token = client.get_token()
        ok(f"токен получен, действует до {getattr(token, 'expires_at', '?')}")
    except Exception as error:  # noqa: BLE001
        fail("3", explain_error(error))
        print("  Проверяю, не в scope ли дело (ключ привязан к одному типу доступа):")
        working = probe_scopes(settings)
        if working and working != settings.gigachat_scope:
            print(f"  РЕШЕНИЕ: ключ работает со scope {working}. Поставь в .env: GIGACHAT_SCOPE={working}")
        elif working:
            print("  Со scope из .env токен получается при повторной попытке: возможно, был временный сбой.")
        else:
            print("  Ни один scope не подошёл: ключ неверный, отозван или принадлежит другому проекту Studio. "
                  "Создай новый ключ в Studio (Настройки API -> Получить ключ) и вставь «Ключ авторизации».")
        return 1

    print("Шаг 4. Доступные модели")
    try:
        models = client.get_models()
        ids = [getattr(m, "id_", getattr(m, "id", "?")) for m in models.data]
        print(f"  модели: {', '.join(ids)}")
        if settings.gigachat_model in ids:
            ok(f"модель {settings.gigachat_model} доступна")
        else:
            fail("4", f"модели {settings.gigachat_model} нет в списке. Задай GIGACHAT_MODEL одной из перечисленных выше")
    except Exception as error:  # noqa: BLE001
        fail("4", explain_error(error))

    from app.llm import chat, function_result_message

    print("Шаг 5. Обычный ответ модели")
    try:
        reply = chat([{"role": "user", "content": "Ответь одним словом: привет"}], provider="gigachat")
        ok(f"ответ: {reply.text.strip()[:80]!r}")
    except Exception as error:  # noqa: BLE001
        fail("5", str(error))

    print(f"Шаг 6. Эмбеддинги (провайдер: {settings.embedding_provider}; подробнее: python check_embeddings.py)")
    try:
        from app.embeddings import embed_texts
        first, second = embed_texts(["Водитель обязан сделать перерыв 45 минут", "Загрузка РЦ выше 90% означает статус critical"])
        similarity = sum(a * b for a, b in zip(first, second))
        ok(f"размер вектора: {len(first)}, длина вектора: {math.sqrt(sum(v * v for v in first)):.3f}, сходство двух разных фраз: {similarity:.3f}")
        if settings.embedding_dim and len(first) != settings.embedding_dim:
            fail("6", f"в .env EMBEDDING_DIM={settings.embedding_dim}, а модель возвращает {len(first)}. "
                      "Удали EMBEDDING_DIM из .env (размер определяется автоматически) и выполни: python -m app.setup_db --recreate")
    except Exception as error:  # noqa: BLE001
        fail("6", str(error))

    print("Шаг 7. Вызов функции (основа агента)")
    functions = [{
        "name": "get_hub_load",
        "description": "Возвращает текущую загрузку распределительного центра (РЦ) в процентах",
        "parameters": {
            "type": "object",
            "properties": {"hub": {"type": "string", "description": "Название города или РЦ, например Краснодар"}},
            "required": ["hub"],
        },
    }]
    messages = [{"role": "user", "content": "Какая сейчас загрузка РЦ Краснодар?"}]
    try:
        first_reply = chat(messages, functions=functions, provider="gigachat")
        if first_reply.tool_call is None:
            fail("7", f"модель не вызвала функцию, а ответила текстом: {first_reply.text.strip()[:120]!r}. "
                      "Попробуй другую модель в GIGACHAT_MODEL (например, GigaChat-2-Pro)")
        else:
            ok(f"модель вызвала {first_reply.tool_call.name}({first_reply.tool_call.arguments})")
            messages += [first_reply.message, function_result_message(first_reply.tool_call.name, {"hub": "Краснодар", "load_percent": 93})]
            final = chat(messages, functions=functions, provider="gigachat")
            ok(f"итоговый ответ: {final.text.strip()[:160]!r}")
    except Exception as error:  # noqa: BLE001
        fail("7", str(error))

    print()
    print("ИТОГ:", "всё в порядке" if not FAILED else f"проблемы на шагах: {', '.join(FAILED)}")
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())
