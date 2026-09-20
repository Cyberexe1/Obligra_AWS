"""Application configuration.

Settings are loaded from environment variables (optionally via a local
`.env` file, see `.env.example` for the supported keys).

AWS credentials are NEVER read or stored by this module. They are picked up
directly by boto3's default credential chain, which checks (in order):
standard `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN`
environment variables, a shared `~/.aws/credentials` file, or an attached
IAM role (e.g. on EC2/ECS/Lambda). Only non-secret configuration such as the
AWS region and bucket name is handled here.
"""

from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the OBLIGRA backend."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = Field(default="OBLIGRA API")
    environment: str = Field(default="development")
    api_prefix: str = Field(default="/api")
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])
    # Optional single-origin convenience setting for the deployed frontend
    # (e.g. a CloudFront domain). If set, it is appended to `cors_origins`
    # in `get_settings()` below rather than replacing it — this lets a
    # deployment set just `FRONTEND_URL` without also having to repeat it
    # inside the `CORS_ORIGINS` JSON list, while still allowing
    # `CORS_ORIGINS` to list additional origins (e.g. a staging domain)
    # if needed.
    frontend_url: str | None = Field(default=None)

    # AWS / S3 configuration. Credentials themselves are intentionally not
    # modeled as settings fields — see module docstring.
    aws_region: str = Field(default="us-east-1")
    s3_bucket_name: str = Field(default="")
    s3_upload_prefix: str = Field(default="uploads/")

    # Upload validation.
    max_upload_size_mb: int = Field(default=15)
    allowed_upload_content_types: list[str] = Field(
        default_factory=lambda: [
            "application/pdf",
            "image/png",
            "image/jpeg",
        ]
    )

    # Textract extraction. The async job API is used for both images and
    # PDFs (single- and multi-page), so the same code path handles all
    # supported upload types without a page-count special case.
    textract_poll_interval_seconds: float = Field(default=1.0)
    textract_poll_timeout_seconds: float = Field(default=60.0)

    # Bedrock obligation extraction.
    bedrock_model_id: str = Field(default="amazon.nova-pro-v1:0")
    bedrock_max_tokens: int = Field(default=4096)
    bedrock_temperature: float = Field(default=0.0)

    # DynamoDB persistence.
    dynamodb_documents_table: str = Field(default="obligra-documents")
    dynamodb_obligations_table: str = Field(default="obligra-obligations")
    # Accepts either DYNAMODB_OBLIGATION_RELATIONSHIPS_TABLE (this
    # project's original, more descriptive name) or
    # DYNAMODB_RELATIONSHIPS_TABLE (a shorter name some deployment
    # configs may use) — either one sets the same field.
    dynamodb_obligation_relationships_table: str = Field(
        default="obligra-obligation-relationships",
        validation_alias=AliasChoices(
            "DYNAMODB_OBLIGATION_RELATIONSHIPS_TABLE", "DYNAMODB_RELATIONSHIPS_TABLE"
        ),
    )
    dynamodb_users_table: str = Field(default="obligra-users")
    dynamodb_sources_table: str = Field(default="obligra-sources")
    dynamodb_telegram_links_table: str = Field(default="obligra-telegram-links")
    dynamodb_telegram_link_codes_table: str = Field(default="obligra-telegram-link-codes")

    # Authentication (JWT + bcrypt). `jwt_secret_key` has no default on
    # purpose: running with a missing or predictable secret would let
    # anyone forge valid tokens, so the app must fail to start rather than
    # silently fall back to something insecure.
    jwt_secret_key: str
    jwt_algorithm: str = Field(default="HS256")
    # Accepts either ACCESS_TOKEN_EXPIRE_MINUTES (this project's original
    # name) or JWT_ACCESS_TOKEN_EXPIRE_MINUTES (a more explicit name some
    # deployment configs may use) — either one sets the same field.
    access_token_expire_minutes: int = Field(
        default=60,
        validation_alias=AliasChoices("ACCESS_TOKEN_EXPIRE_MINUTES", "JWT_ACCESS_TOKEN_EXPIRE_MINUTES"),
    )

    # Telegram Bot API integration. Unlike `jwt_secret_key`, this
    # defaults to `""` rather than being required — the rest of the app
    # (documents, sources, obligations, auth) has no Telegram dependency,
    # so the whole backend should not refuse to start just because
    # Telegram isn't configured yet. Endpoints under
    # `app/routers/telegram.py` check for an empty token themselves and
    # respond with a clear 503 rather than calling the Telegram API with
    # no credentials.
    telegram_bot_token: str = Field(default="")
    # If set, incoming webhook requests must carry this exact value in
    # the `X-Telegram-Bot-Api-Secret-Token` header (Telegram sets this
    # header automatically once the secret is registered via
    # `setWebhook`). Left unset, the endpoint accepts any caller —
    # acceptable for local development, but should be set in any
    # deployment reachable from the public internet.
    telegram_webhook_secret: str | None = Field(default=None)
    # How long a `/api/integrations/telegram/link-code` code remains
    # valid before it can no longer be consumed by `/start <code>`.
    telegram_link_code_ttl_minutes: int = Field(default=10)


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance.

    If `FRONTEND_URL` is set, it is added to `cors_origins` (deduplicated)
    rather than replacing it, so a deployment can set the production
    frontend's URL without needing to also repeat it inside the
    `CORS_ORIGINS` JSON list.
    """
    settings = Settings()
    if settings.frontend_url and settings.frontend_url not in settings.cors_origins:
        settings.cors_origins = [*settings.cors_origins, settings.frontend_url]
    return settings
