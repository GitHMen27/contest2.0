from app.errors import explain_error


def test_payment_required_gets_a_token_hint():
    message = explain_error(RuntimeError("402 Payment Required"))
    assert "402 Payment Required" in message
    assert "Embeddings" in message


def test_auth_error_hint_still_works():
    message = explain_error(RuntimeError("401 Unauthorized"))
    assert "GIGACHAT_CREDENTIALS" in message


def test_bad_request_points_to_scope_and_diagnostics():
    message = explain_error(RuntimeError("400 Bad Request: scope from db not fully includes consumed scope"))
    assert "GIGACHAT_API_PERS" in message
    assert "check_gigachat.py" in message


def test_unknown_error_has_no_hint():
    assert explain_error(ValueError("что-то странное")) == "ValueError: что-то странное"
