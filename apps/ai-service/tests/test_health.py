import pytest
from fastapi.testclient import TestClient

from ai_service.config import Settings
from ai_service.main import create_app


def _app(**settings: object):
    """Hermetic app: never reads the developer's .env."""
    return create_app(Settings(_env_file=None, **settings))  # type: ignore[arg-type]


@pytest.fixture
def client() -> TestClient:
    return TestClient(_app())


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "ai-service"
    assert body["version"] == "0.1.0"
    assert body["timestamp"].endswith(("Z", "+00:00"))


def test_health_reports_missing_llm_configuration(client: TestClient) -> None:
    """No key is required to boot: the service stays healthy and says so."""
    assert client.get("/health").json()["llm"] == "missing"


def test_health_reports_configured_llm() -> None:
    client = TestClient(_app(llm_api_key="sk-test", llm_model="test/model"))

    assert client.get("/health").json()["llm"] == "configured"


def test_openapi_documents_health(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()

    assert schema["info"]["title"] == "AI BI ai-service"
    assert "/health" in schema["paths"]
