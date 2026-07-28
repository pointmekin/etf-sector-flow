import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from sector_flow.api import BacktestRequest, app


def test_health_without_database_configuration() -> None:
    response = TestClient(app).get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["database"] in {"ok", "not_configured"}


def test_backtest_request_defaults_to_next_day_execution() -> None:
    request = BacktestRequest()

    assert request.execution_delay_days == 1


def test_backtest_request_rejects_same_day_execution() -> None:
    with pytest.raises(ValidationError):
        BacktestRequest(execution_delay_days=0)
