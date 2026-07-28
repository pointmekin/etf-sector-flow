from types import SimpleNamespace

from fastapi.testclient import TestClient

from sector_flow import auth


def test_basic_auth_rejects_invalid_credentials(monkeypatch) -> None:
    monkeypatch.setattr(
        auth,
        "get_settings",
        lambda: SimpleNamespace(basic_auth_username="operator", basic_auth_password="secret"),
    )
    try:
        auth.require_basic_auth(None)
    except Exception as error:
        assert error.status_code == 401
        assert error.headers == {"WWW-Authenticate": "Basic"}
    else:
        raise AssertionError("Missing credentials must be rejected")


def test_protected_route_accepts_valid_basic_auth(monkeypatch) -> None:
    monkeypatch.setattr(
        auth,
        "get_settings",
        lambda: SimpleNamespace(basic_auth_username="operator", basic_auth_password="secret"),
    )
    credentials = auth.HTTPBasicCredentials(username="operator", password="secret")
    assert auth.require_basic_auth(credentials) == "operator"


def test_api_returns_basic_challenge_without_configuration() -> None:
    from sector_flow.api import app

    response = TestClient(app).get("/api/v1/jobs/latest")

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Basic"
