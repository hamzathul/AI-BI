from pathlib import Path

import pytest

from ai_service.config import Settings


def _settings(**overrides: object) -> Settings:
    """Hermetic settings: never read the developer's own .env or stray env vars."""
    return Settings(_env_file=None, **overrides)  # type: ignore[arg-type]


def test_llm_is_optional_so_the_service_can_boot_without_a_key() -> None:
    settings = _settings()

    assert settings.llm_configured is False
    assert settings.missing_llm_settings == ["LLM_API_KEY", "LLM_MODEL"]
    assert settings.llm_base_url == "https://openrouter.ai/api/v1"


def test_key_plus_model_configure_the_llm() -> None:
    settings = _settings(llm_api_key="sk-test", llm_model="openai/gpt-5-mini")

    assert settings.llm_configured is True
    assert settings.missing_llm_settings == []


def test_blank_values_count_as_missing() -> None:
    """Copying .env.example and forgetting to fill it in must not look configured."""
    settings = _settings(llm_api_key="   ", llm_model="  ")

    assert settings.llm_configured is False
    assert settings.missing_llm_settings == ["LLM_API_KEY", "LLM_MODEL"]


def test_secret_key_is_masked_in_repr_and_str() -> None:
    settings = _settings(llm_api_key="sk-or-v1-super-secret", llm_model="m")

    assert "sk-or-v1-super-secret" not in repr(settings)
    assert "sk-or-v1-super-secret" not in str(settings)
    assert settings.llm_api_key is not None
    assert settings.llm_api_key.get_secret_value() == "sk-or-v1-super-secret"


def test_environment_overrides_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_MODEL", "deepseek/deepseek-chat-v3.1")
    monkeypatch.setenv("LLM_MAX_RETRIES", "0")

    settings = _settings()

    assert settings.llm_model == "deepseek/deepseek-chat-v3.1"
    assert settings.llm_max_retries == 0


def test_reads_a_dotenv_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("LLM_MODEL", raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text(
        "LLM_API_KEY=sk-from-file\nLLM_MODEL=google/gemini-2.5-flash\n", encoding="utf-8"
    )

    settings = Settings(_env_file=env_file)

    assert settings.llm_configured is True
    assert settings.llm_model == "google/gemini-2.5-flash"
    assert settings.llm_api_key is not None
    assert settings.llm_api_key.get_secret_value() == "sk-from-file"
