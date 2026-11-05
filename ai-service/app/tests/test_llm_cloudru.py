import json
from types import SimpleNamespace

import pytest

from app import llm
from app.llm import ToolCall, function_result_message, parse_openai_response


def _response(message, finish="stop"):
    return SimpleNamespace(choices=[SimpleNamespace(message=message, finish_reason=finish)])


def _tool_call(name="get_hub_load", arguments='{"hub": "Краснодар"}', call_id="call_1"):
    return SimpleNamespace(id=call_id, function=SimpleNamespace(name=name, arguments=arguments))


def test_plain_answer():
    result = parse_openai_response(_response(SimpleNamespace(content="Привет", tool_calls=None)))
    assert result.text == "Привет" and result.tool_call is None
    assert result.message == {"role": "assistant", "content": "Привет"}
    assert result.finish_reason == "stop"


def test_thinking_block_is_removed():
    message = SimpleNamespace(content="<think>сначала подумаю\nещё раз</think>\nОтвет: 45 минут [1]", tool_calls=None)
    assert parse_openai_response(_response(message)).text == "Ответ: 45 минут [1]"


def test_empty_content_is_empty_string():
    assert parse_openai_response(_response(SimpleNamespace(content=None, tool_calls=None))).text == ""


def test_tool_call_is_parsed_and_kept_in_history():
    message = SimpleNamespace(content=None, tool_calls=[_tool_call()])
    result = parse_openai_response(_response(message, finish="tool_calls"))
    assert result.tool_call == ToolCall(name="get_hub_load", arguments={"hub": "Краснодар"}, id="call_1")
    entry = result.message["tool_calls"][0]
    assert entry["id"] == "call_1" and entry["type"] == "function"
    assert json.loads(entry["function"]["arguments"]) == {"hub": "Краснодар"}


def test_broken_tool_arguments_become_empty_dict():
    message = SimpleNamespace(content="", tool_calls=[_tool_call(arguments="{oops")])
    assert parse_openai_response(_response(message)).tool_call.arguments == {}


def test_function_result_for_cloudru_uses_tool_role():
    message = function_result_message("get_hub_load", {"load_percent": 93}, tool_call_id="call_1")
    assert message["role"] == "tool" and message["tool_call_id"] == "call_1"
    assert json.loads(message["content"]) == {"load_percent": 93}
    assert "name" not in message


class FakeChatApi:
    def __init__(self, fail_with: Exception | None = None):
        self.payloads: list[dict] = []
        self.fail_with = fail_with
        self.completions = self  # client.chat.completions.create(...)

    def create(self, **payload):
        self.payloads.append(payload)
        if self.fail_with:
            raise self.fail_with
        return _response(SimpleNamespace(content="Ответ", tool_calls=None))


@pytest.fixture
def fake_chat(monkeypatch):
    api = FakeChatApi()
    settings = SimpleNamespace(llm_provider="cloudru", cloud_chat_model="vendor/model-x")
    monkeypatch.setattr("app.config.get_settings", lambda: settings)
    monkeypatch.setattr("app.cloud_client.get_cloud_client", lambda: SimpleNamespace(chat=api))
    return api


def test_chat_uses_cloudru_model_from_settings(fake_chat):
    result = llm.chat([{"role": "user", "content": "привет"}], temperature=0.1, max_tokens=50)
    assert result.text == "Ответ"
    payload = fake_chat.payloads[0]
    assert payload["model"] == "vendor/model-x" and payload["temperature"] == 0.1 and payload["max_tokens"] == 50
    assert "tools" not in payload


def test_explicit_model_overrides_settings(fake_chat):
    llm.chat([{"role": "user", "content": "привет"}], model="other/model")
    assert fake_chat.payloads[0]["model"] == "other/model"


def test_functions_are_sent_as_openai_tools(fake_chat):
    function = {"name": "f", "description": "d", "parameters": {"type": "object", "properties": {}}}
    llm.chat([{"role": "user", "content": "x"}], functions=[function])
    payload = fake_chat.payloads[0]
    assert payload["tools"] == [{"type": "function", "function": function}]
    assert payload["tool_choice"] == "auto"


def test_missing_model_gives_clear_instruction(monkeypatch):
    settings = SimpleNamespace(llm_provider="cloudru", cloud_chat_model="")
    monkeypatch.setattr("app.config.get_settings", lambda: settings)
    with pytest.raises(RuntimeError, match="CLOUD_CHAT_MODEL"):
        llm.chat([{"role": "user", "content": "x"}])


def test_api_error_becomes_readable_message(fake_chat):
    fake_chat.fail_with = Exception("404 model not found")
    with pytest.raises(RuntimeError, match="CLOUD_CHAT_MODEL"):
        llm.chat([{"role": "user", "content": "x"}])
