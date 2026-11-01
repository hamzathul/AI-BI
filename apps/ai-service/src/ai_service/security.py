"""Inbound service-token check for ai-service routes (6.4).

The token is the same `INTERNAL_API_TOKEN` core-api validates (D60), now used in
both directions: core-api proves itself to ai-service, ai-service proves itself
to core-api. It never appears in a log or a response.

Missing configuration is a 503 (the operator must fix it); a missing or wrong
token is a 401 with no hint, exactly like core-api's guard.
"""

import hashlib
import hmac
import re
from typing import Annotated

from fastapi import Header, HTTPException, Request, status

BEARER = re.compile(r"^Bearer\s+(.+)$", re.IGNORECASE)


def _digest(value: str) -> bytes:
    """Hash first so `compare_digest` always gets equal-length inputs."""
    return hashlib.sha256(value.encode("utf-8")).digest()


def require_service_token(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    """FastAPI dependency: allow only a caller holding the shared token."""
    settings = request.app.state.settings
    secret = settings.internal_api_token

    if secret is None or not secret.get_secret_value().strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ai-service is not configured.",
        )

    match = BEARER.match((authorization or "").strip())
    provided = match.group(1).strip() if match else ""

    if not provided or not hmac.compare_digest(
        _digest(provided), _digest(secret.get_secret_value())
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing service token.",
        )
