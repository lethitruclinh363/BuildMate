"""Shared-secret gate for BuildMate-only eKYC endpoints."""

import hmac

from fastapi import Header, HTTPException, status

from app.core.config import settings


def require_internal_token(
    x_internal_token: str | None = Header(default=None),
) -> None:
    expected = settings.EKYC_INTERNAL_TOKEN or ""
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="eKYC internal token is not configured",
        )
    provided = x_internal_token or ""
    try:
        matches = hmac.compare_digest(
            provided.encode("utf-8"),
            expected.encode("utf-8"),
        )
    except (TypeError, ValueError):
        matches = False
    if not matches:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized",
        )
