"""Shared pytest fixtures for the OBLIGRA backend test suite.

Sets required environment variables (`JWT_SECRET_KEY`, ...) before any
application module is imported, since `app.config.get_settings()` is
`lru_cache`d and reads the environment on its first call in the process —
importing `app.config` (directly or transitively) before these are set
would either fail (for required fields with no default, like
`jwt_secret_key`) or silently pick up whatever real `.env` file happens to
exist in the developer's working directory, which tests must never
depend on.
"""

import os

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("AWS_REGION", "us-east-1")
os.environ.setdefault("S3_BUCKET_NAME", "test-obligra-bucket")
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "test-telegram-bot-token")

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    """A FastAPI TestClient wired to the real app, for endpoint-level tests."""
    return TestClient(app)
