from types import SimpleNamespace

from app.llm import function_result_message, parse_response


def _response(message, finish="stop"):
    return SimpleNamespace(choices=[SimpleNamespace(message=message, finish_reason=finish)])


def test_plain_text_answer():
    result = parse_response(_response(SimpleNamespace(content="Привет", function_call=None, functions_state_id=None)))
    assert result.text == "Привет" and result.tool_call is None
    assert result.message == {"role": "assistant", "content": "Привет"}
    assert result.finish_reason == "stop"


def test_function_call_with_dict_arguments_keeps_state_id():
    call = SimpleNamespace(name="get_hub_load", arguments={"hub": "Краснодар"})
    message = SimpleNamespace(content=None, function_call=call, functions_state_id="abc-123")
    result = parse_response(_response(message, finish="function_call"))
    assert result.tool_call.name == "get_hub_load" and result.tool_call.arguments == {"hub": "Краснодар"}
    assert result.message["function_call"] == {"name": "get_hub_load", "arguments": {"hub": "Краснодар"}}
    assert result.message["functions_state_id"] == "abc-123"
    assert result.message["content"] == ""


def test_function_call_with_string_arguments_is_parsed():
    call = SimpleNamespace(name="f", arguments='{"x": 1}')
    result = parse_response(_response(SimpleNamespace(content="", function_call=call)))
    assert result.tool_call.arguments == {"x": 1}


def test_broken_json_arguments_become_empty_dict():
    call = SimpleNamespace(name="f", arguments="{oops")
    assert parse_response(_response(SimpleNamespace(content="", function_call=call))).tool_call.arguments == {}


def test_function_result_message_is_valid_json_string():
    import json

    message = function_result_message("get_hub_load", {"hub": "Краснодар", "load_percent": 93})
    assert message["role"] == "function" and message["name"] == "get_hub_load"
    assert json.loads(message["content"]) == {"hub": "Краснодар", "load_percent": 93}
    wrapped = function_result_message("f", [1, 2])
    assert json.loads(wrapped["content"]) == {"result": [1, 2]}
