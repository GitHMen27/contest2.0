"""Понятные сообщения об ошибках GigaChat. Без сторонних библиотек, чтобы модуль можно было импортировать где угодно."""
from __future__ import annotations


def _cloudru_hint(low: str, name: str) -> str:
    """Подсказки для Cloud.ru Foundation Models (OpenAI-совместимый API)."""
    if "certificate" in low or "ssl" in low:
        return "Не проходит проверка сертификата: проверь дату и время на компьютере, антивирус или корпоративный прокси."
    if name == "AuthenticationError" or "401" in low:
        return "Ключ не принят: проверь CLOUD_API_KEY в .env (ключ целиком, без кавычек и пробелов) и что он не отозван в консоли Cloud.ru."
    if name == "PermissionDeniedError" or "403" in low:
        return "Доступ запрещён: у ключа нет прав на Foundation Models или модель не подключена в твоём аккаунте."
    if name == "NotFoundError" or "404" in low or "model" in low and "not found" in low:
        return "Модель или адрес не найдены: проверь CLOUD_CHAT_MODEL (python check_chat.py --list), CLOUD_EMBEDDING_MODEL и CLOUD_BASE_URL (https://foundation-models.api.cloud.ru/v1)."
    if "402" in low or "payment" in low or "insufficient" in low or "balance" in low:
        return "Не хватает средств или лимита: проверь баланс и лимиты Foundation Models в консоли Cloud.ru."
    if name == "RateLimitError" or "429" in low:
        return "Слишком много запросов: подожди минуту. Если повторяется, проверь лимиты в консоли Cloud.ru."
    if "timeout" in low or "timed out" in low or "connection" in low or "connect" in low:
        return "Нет связи с Cloud.ru: проверь интернет и VPN, затем повтори."
    return ""


def explain_error(error: BaseException, provider: str = "gigachat") -> str:
    """Превращает исключение SDK/сети в сообщение с подсказкой, что делать.

    provider: "gigachat" (по умолчанию) или "cloudru"; от него зависят подсказки.
    """
    parts: list[str] = []
    current: BaseException | None = error
    while current is not None and len(parts) < 5:  # идём по цепочке причин
        parts.append(f"{type(current).__name__}: {current}")
        current = current.__cause__ or current.__context__
    text = " | ".join(parts)
    low = text.lower()
    name = type(error).__name__

    if provider == "cloudru":
        hint = _cloudru_hint(low, name)
        return f"{text}. {hint}".strip() if hint else text

    if "certificate" in low or "ssl" in low:
        hint = (
            "Не проходит проверка сертификата. Скачай «Russian Trusted Root CA» (gosuslugi.ru/crt) "
            "и укажи путь в .env: GIGACHAT_CA_BUNDLE_FILE=C:\\путь\\к\\файлу.cer . "
            "Только для разработки можно временно поставить GIGACHAT_VERIFY_SSL_CERTS=false."
        )
    elif "payment required" in low or "402" in low:
        hint = (
            "Закончились оплаченные токены. Эмбеддинги и чат GigaChat считаются в разных пакетах: "
            "проверь остаток именно по модели Embeddings (и по GigaChat) в личном кабинете Studio и пополни пакет."
        )
    elif name == "AuthenticationError" or "401" in low:
        hint = (
            "Ключ не принят: проверь GIGACHAT_CREDENTIALS (ключ авторизации целиком, без кавычек и пробелов) "
            "и GIGACHAT_SCOPE (для физических лиц GIGACHAT_API_PERS)."
        )
    elif "400" in low or "bad request" in low or "scope" in low:
        hint = (
            "GigaChat отклонил запрос токена (400). Чаще всего: ключ привязан к другому scope "
            "(GIGACHAT_API_PERS для физлиц, GIGACHAT_API_B2B или GIGACHAT_API_CORP для юрлиц), "
            "в GIGACHAT_CREDENTIALS вставлен не «Ключ авторизации» (а Client Secret или строка с Basic), "
            "или новый ключ перекрыт старым из переменной окружения. Запусти python check_gigachat.py: он покажет, что именно не так."
        )
    elif name == "RateLimitError" or "429" in low:
        hint = "Слишком много запросов или закончились токены. Подожди минуту и проверь остаток в личном кабинете Studio."
    elif name == "ForbiddenError" or "403" in low:
        hint = "Доступ запрещён: проверь scope и что выбранная модель входит в твой тариф."
    elif "timeout" in low or "timed out" in low or "connect" in low:
        hint = "Нет связи с серверами GigaChat. Проверь интернет; если включён VPN, попробуй выключить его (GigaChat российский сервис)."
    else:
        hint = ""
    return f"{text}. {hint}".strip() if hint else text
