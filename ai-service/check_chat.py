"""Диагностика чата через Cloud.ru Foundation Models: ключ, список моделей, ответ, вызов функции.

Запуск из папки ai-service/ (с активированным .venv):
    python check_chat.py --list      # показать модели, доступные ключу (из них выбери CLOUD_CHAT_MODEL)
    python check_chat.py             # проверить модель из .env (CLOUD_CHAT_MODEL)
    python check_chat.py --model ID  # проверить конкретную модель, не меняя .env

Ключи и пароли в вывод не попадают.
"""
from __future__ import annotations

import argparse
import sys

FAILED: list[str] = []


def ok(text: str) -> None:
    print(f"  OK   {text}")


def fail(step: str, text: str) -> None:
    FAILED.append(step)
    print(f"  FAIL {text}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--list", action="store_true", help="показать доступные модели и выйти")
    parser.add_argument("--model", default="", help="проверить эту модель вместо CLOUD_CHAT_MODEL")
    args = parser.parse_args()

    print("Шаг 1. Настройки")
    try:
        from app.config import get_settings
        settings = get_settings()
    except Exception as error:  # noqa: BLE001
        fail("1", f"{type(error).__name__}: {error}")
        return 1
    if not settings.cloud_api_key:
        fail("1", "не задан CLOUD_API_KEY в .env")
        return 1
    ok(f"адрес={settings.cloud_base_url}, LLM_PROVIDER={settings.llm_provider}, "
       f"CLOUD_CHAT_MODEL={settings.cloud_chat_model or '(не задана)'}")

    from app.cloud_client import get_cloud_client
    from app.errors import explain_error

    print("Шаг 2. Список моделей")
    try:
        models = [m.id for m in get_cloud_client().models.list().data]
        chat_models = sorted(m for m in models if "embed" not in m.lower())
        embed_models = sorted(m for m in models if "embed" in m.lower())
        print(f"  чат-модели ({len(chat_models)}):")
        for model_id in chat_models:
            print(f"    {model_id}")
        if embed_models:
            print(f"  модели эмбеддингов: {', '.join(embed_models)}")
        ok(f"получено моделей: {len(models)}")
    except Exception as error:  # noqa: BLE001
        models = []
        print(f"  список моделей недоступен ({explain_error(error, provider='cloudru')}); возьми id из каталога Cloud.ru")
    if args.list:
        print("\nВпиши выбранный id в .env: CLOUD_CHAT_MODEL=...  и запусти: python check_chat.py")
        return 0

    model = args.model or settings.cloud_chat_model
    if not model:
        fail("2", "не задана модель. Выполни python check_chat.py --list и впиши id в .env: CLOUD_CHAT_MODEL=...")
        return 1
    if models and model not in models:
        fail("2", f"модели {model!r} нет в списке доступных ключу. Проверь написание (регистр и префикс важны)")

    from app.llm import chat, function_result_message
    from app.rag import NO_ANSWER, build_messages
    from app.retrieval import Hit

    print(f"Шаг 3. Обычный ответ модели ({model})")
    try:
        reply = chat([{"role": "user", "content": "Ответь одним словом: привет"}], provider="cloudru", model=model, max_tokens=200)
        if reply.text.strip():
            ok(f"ответ: {reply.text.strip()[:80]!r}")
        else:
            fail("3", "ответ пустой. Это может быть «думающая» модель, которой не хватило max_tokens; попробуй другую модель")
    except Exception as error:  # noqa: BLE001
        fail("3", str(error))
        return 1

    print("Шаг 4. Ответ по контексту (как в /rag/ask)")
    hits = [Hit(id=1, doc="Режим труда водителей", section="Перерывы", score=0.1,
                content="Режим труда водителей — Перерывы\nПосле 4,5 часов управления водитель обязан сделать перерыв не менее 45 минут.")]
    try:
        known = chat(build_messages("Какой перерыв нужен водителю после 4,5 часов за рулём?", hits),
                     provider="cloudru", model=model, max_tokens=500)
        if "45" in known.text:
            ok(f"ответ с цифрой из контекста: {known.text.strip()[:120]!r}")
        else:
            fail("4", f"в ответе нет «45»: {known.text.strip()[:160]!r}")
        unknown = chat(build_messages("Какая столица Австралии?", hits), provider="cloudru", model=model, max_tokens=300)
        if NO_ANSWER.rstrip(".") in unknown.text:
            ok("на вопрос не по теме модель честно отвечает, что ответа в регламентах нет")
        else:
            print(f"  заметка: на вопрос не по теме модель ответила иначе: {unknown.text.strip()[:140]!r}. "
                  "Это не ошибка, но можно выбрать модель, которая строже следует инструкциям")
    except Exception as error:  # noqa: BLE001
        fail("4", str(error))

    print("Шаг 5. Вызов функции (понадобится для агента; для RAG не обязателен)")
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
        first = chat(messages, functions=functions, provider="cloudru", model=model, max_tokens=500)
        if first.tool_call is None:
            print(f"  заметка: модель не вызвала функцию и ответила текстом: {first.text.strip()[:120]!r}. "
                  "Для RAG это не мешает")
        else:
            ok(f"модель вызвала {first.tool_call.name}({first.tool_call.arguments})")
            messages += [first.message, function_result_message(first.tool_call.name, {"hub": "Краснодар", "load_percent": 93},
                                                                  tool_call_id=first.tool_call.id)]
            final = chat(messages, functions=functions, provider="cloudru", model=model, max_tokens=500)
            ok(f"итоговый ответ: {final.text.strip()[:140]!r}")
    except Exception as error:  # noqa: BLE001
        print(f"  заметка: вызов функций не сработал ({str(error)[:200]}). Для RAG это не мешает")

    print()
    print("ИТОГ:", "всё в порядке" if not FAILED else f"проблемы на шагах: {', '.join(FAILED)}")
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())
