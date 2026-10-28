import pytest
from fastapi.testclient import TestClient

from ai_service.main import create_app


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "ai-service"
    assert body["version"] == "0.1.0"
    assert body["timestamp"].endswith(("Z", "+00:00"))


def test_openapi_documents_health(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()

    assert schema["info"]["title"] == "AI BI ai-service"
    assert "/health" in schema["paths"]
