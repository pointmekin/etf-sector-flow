from fastapi.testclient import TestClient

from sector_flow.api import app


def test_health_without_database_configuration() -> None:
    response = TestClient(app).get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "not_configured"}
