"""Тесты токена авторизации: подпись, срок действия, подделка роли."""
from app.auth import MIN_SECRET_LENGTH, create_token, verify_token

SECRET = "x" * MIN_SECRET_LENGTH


def test_token_roundtrip():
    token = create_token("admin", "admin", SECRET, ttl_seconds=60, now=1_000)
    payload = verify_token(token, SECRET, now=1_030)
    assert payload is not None
    assert payload["sub"] == "admin"
    assert payload["role"] == "admin"


def test_expired_token_is_rejected():
    token = create_token("user", "user", SECRET, ttl_seconds=60, now=1_000)
    assert verify_token(token, SECRET, now=1_061) is None


def test_wrong_secret_is_rejected():
    token = create_token("user", "user", SECRET, ttl_seconds=60, now=1_000)
    assert verify_token(token, "y" * MIN_SECRET_LENGTH, now=1_001) is None


def test_role_cannot_be_forged():
    """Подмена роли в теле токена ломает подпись: обычный пользователь не станет админом."""
    user_token = create_token("user", "user", SECRET, ttl_seconds=60, now=1_000)
    admin_token = create_token("admin", "admin", SECRET, ttl_seconds=60, now=1_000)
    forged = admin_token.split(".")[0] + "." + user_token.split(".")[1]
    assert verify_token(forged, SECRET, now=1_001) is None


def test_garbage_is_rejected():
    for value in ["", "abc", "a.b", "....", "e30.e30"]:
        assert verify_token(value, SECRET, now=1_000) is None
