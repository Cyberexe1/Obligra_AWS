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
