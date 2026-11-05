"""Обёртка над чатом GigaChat: обычный ответ и вызов функций (инструментов).

Мы передаём в SDK обычные словари (в формате REST API GigaChat), а ответ превращаем в наши
простые объекты. Если SDK изменит свои классы, поменяется только этот файл.

Как работают функции в GigaChat:
  1. В запрос добавляем functions=[...] и function_call="auto".
  2. Если модель решила вызвать функцию, в ответе есть function_call {name, arguments} и functions_state_id.
  3. Мы выполняем функцию сами и добавляем в историю: сообщение модели (как пришло) и сообщение роли
     "function" с результатом (строка с JSON). Затем снова вызываем chat().
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from app.errors import explain_error

_THINK_BLOCK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


@dataclass
class ToolCall:
    name: str
    arguments: dict[str, Any]
    id: str | None = None                       # только у Cloud.ru (OpenAI-формат): нужен, чтобы отдать результат функции


@dataclass
class LLMResponse:
    text: str                                   # текст ответа (может быть пустым, если модель вызывает функцию)
    tool_call: ToolCall | None = None           # вызов функции, если модель его запросила
    message: dict[str, Any] = field(default_factory=dict)  # сообщение модели в виде, пригодном для истории
    finish_reason: str | None = None


def parse_response(response: Any) -> LLMResponse:
    """Достаёт из ответа SDK текст и вызов функции (без обращения к сети, поэтому легко тестируется)."""
    choice = response.choices[0]
    message = choice.message
    content = getattr(message, "content", None) or ""
    history_message: dict[str, Any] = {"role": "assistant", "content": content}
    tool_call: ToolCall | None = None

    call = getattr(message, "function_call", None)
    if call is not None:
        arguments = getattr(call, "arguments", None) or {}
        if isinstance(arguments, str):  # на всякий случай: аргументы могут прийти строкой с JSON
            try:
                arguments = json.loads(arguments)
            except json.JSONDecodeError:
                arguments = {}
        arguments = dict(arguments)
        tool_call = ToolCall(name=call.name, arguments=arguments)
        history_message["function_call"] = {"name": call.name, "arguments": arguments}
        state_id = getattr(message, "functions_state_id", None)
        if state_id:
            history_message["functions_state_id"] = state_id

    return LLMResponse(
        text=content,
        tool_call=tool_call,
        message=history_message,
        finish_reason=getattr(choice, "finish_reason", None),
    )


def parse_openai_response(response: Any) -> LLMResponse:
    """То же самое для ответа в OpenAI-формате (Cloud.ru): вызов функции лежит в message.tool_calls."""
    choice = response.choices[0]
    message = choice.message
    content = getattr(message, "content", None) or ""
    # Модели «с рассуждениями» (Qwen3, DeepSeek и др.) иногда пишут ход мыслей в <think>...</think>: показывать его не нужно
    content = _THINK_BLOCK.sub("", content).strip()
    history_message: dict[str, Any] = {"role": "assistant", "content": content}
    tool_call: ToolCall | None = None

    calls = getattr(message, "tool_calls", None) or []
    if calls:
        first = calls[0]
        raw_arguments = getattr(first.function, "arguments", None) or "{}"
        try:
            arguments = json.loads(raw_arguments) if isinstance(raw_arguments, str) else dict(raw_arguments)
        except (json.JSONDecodeError, TypeError, ValueError):
            arguments = {}
        if not isinstance(arguments, dict):
            arguments = {}
        tool_call = ToolCall(name=first.function.name, arguments=arguments, id=getattr(first, "id", None))
        history_message["tool_calls"] = [{
            "id": tool_call.id,
            "type": "function",
            "function": {"name": tool_call.name, "arguments": json.dumps(arguments, ensure_ascii=False)},
        }]

    return LLMResponse(
        text=content,
        tool_call=tool_call,
        message=history_message,
        finish_reason=getattr(choice, "finish_reason", None),
    )


def function_result_message(name: str, result: Any, tool_call_id: str | None = None) -> dict[str, Any]:
    """Сообщение с результатом функции.

    GigaChat ждёт роль function и в content строку с корректным JSON-объектом.
    Cloud.ru (OpenAI-формат) ждёт роль tool и tool_call_id из вызова, на который мы отвечаем.
    """
    if not isinstance(result, dict):
        result = {"result": result}
    content = json.dumps(result, ensure_ascii=False, default=str)
    if tool_call_id:
        return {"role": "tool", "tool_call_id": tool_call_id, "content": content}
    return {"role": "function", "name": name, "content": content}


def chat(
    messages: list[dict[str, Any]],
    functions: list[dict[str, Any]] | None = None,
    temperature: float = 0.2,
    max_tokens: int | None = None,
    model: str | None = None,
    provider: str | None = None,
) -> LLMResponse:
    """Один вызов модели. functions: список описаний {name, description, parameters (JSON Schema)}.

    provider: cloudru или gigachat; по умолчанию берётся LLM_PROVIDER из .env.
    """
    from app.config import get_settings

    settings = get_settings()
    provider = provider or settings.llm_provider
    if provider == "cloudru":
        return _chat_cloudru(messages, functions, temperature, max_tokens, model or settings.cloud_chat_model)
    return _chat_gigachat(messages, functions, temperature, max_tokens, model)


def _chat_cloudru(messages, functions, temperature, max_tokens, model) -> LLMResponse:
    from app.cloud_client import get_cloud_client

    if not model:
        raise RuntimeError(
            "Не задана чат-модель Cloud.ru. Выполни python check_chat.py --list, выбери id модели "
            "и впиши в .env: CLOUD_CHAT_MODEL=..."
        )
    payload: dict[str, Any] = {"model": model, "messages": messages, "temperature": temperature}
    if max_tokens:
        payload["max_tokens"] = max_tokens
    if functions:
        payload["tools"] = [{"type": "function", "function": function} for function in functions]
        payload["tool_choice"] = "auto"
    try:
        response = get_cloud_client().chat.completions.create(**payload)
    except Exception as error:  # noqa: BLE001
        raise RuntimeError(explain_error(error, provider="cloudru")) from error
    return parse_openai_response(response)


def _chat_gigachat(messages, functions, temperature, max_tokens, model) -> LLMResponse:
    from app.gigachat_client import get_client

    payload: dict[str, Any] = {"messages": messages, "temperature": temperature}
    if model:
        payload["model"] = model
    if max_tokens:
        payload["max_tokens"] = max_tokens
    if functions:
        payload["functions"] = functions
        payload["function_call"] = "auto"
    try:
        response = get_client().chat(payload)
    except Exception as error:  # noqa: BLE001
        raise RuntimeError(explain_error(error)) from error
    return parse_response(response)
