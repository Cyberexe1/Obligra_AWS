"""OBLIGRA backend application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import auth, documents, health, obligations, sources, telegram

settings = get_settings()

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix=settings.api_prefix)
app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(documents.router, prefix=settings.api_prefix)
app.include_router(obligations.router, prefix=settings.api_prefix)
app.include_router(sources.router, prefix=settings.api_prefix)
app.include_router(telegram.router, prefix=settings.api_prefix)


@app.get("/")
def read_root() -> dict[str, str]:
    """Root endpoint with a friendly service description."""
    return {"message": "OBLIGRA API is running. See /docs for the API reference."}


@app.get("/health")
def get_health_unprefixed() -> dict[str, str]:
    """Lightweight, dependency-free health check at the bare `/health` path.

    AWS App Runner's default health check path is `/`, which this app
    already answers with a 200 via `read_root` above — but App Runner
    (and most load balancers/orchestrators) can also be pointed at a
    dedicated `/health` path, which is more conventional and makes the
    check's intent explicit. This does not depend on DynamoDB, S3,
    Textract, or Bedrock, so it stays healthy even if those services are
    briefly unreachable — its only job is to confirm the process is up
    and able to serve requests, per the app's `GET /api/health`
    endpoint (`app/routers/health.py`), which this intentionally
    duplicates at the unprefixed path rather than replaces.
    """
    return {"status": "healthy"}
