"""Typed runtime settings for the AI service.

Values come from the process environment or `apps/ai-service/.env`. Settings are
validated by Pydantic, so a bad port or timeout fails at startup with a clear
message instead of deep inside a request.

The LLM values are *optional*: the service must boot and answer `/health`
without a provider key (CI, and every test). `missing_llm_settings` is what the
`llm.py` boundary checks before its first network call.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# Absolute path, not CWD-relative: `uv run --directory` and `--project` both work.
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    """All environment-driven configuration, validated once."""

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # SecretStr masks the value in reprs, logs, and tracebacks (D11 habit).
    llm_api_key: SecretStr | None = None
    llm_model: str | None = None
    llm_base_url: str = "https://openrouter.ai/api/v1"
    llm_timeout_seconds: float = 60.0
    llm_max_retries: int = 2
    llm_max_output_tokens: int = 2000

    @property
    def missing_llm_settings(self) -> list[str]:
        """Env names that must be set before the LLM can be called."""
        missing: list[str] = []
        if self.llm_api_key is None or not self.llm_api_key.get_secret_value().strip():
            missing.append("LLM_API_KEY")
        if not (self.llm_model or "").strip():
            missing.append("LLM_MODEL")
        return missing

    @property
    def llm_configured(self) -> bool:
        return not self.missing_llm_settings


@lru_cache
def get_settings() -> Settings:
    """One validated Settings instance per process."""
    return Settings()
