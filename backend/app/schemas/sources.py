"""Pydantic schemas for the unified `sources` layer.

A `source` represents any raw input that can be turned into obligations
via Bedrock extraction — an uploaded file, pasted text, or (in the
future) an email/WhatsApp/Telegram message. Every obligation persisted
in DynamoDB references the `source_id` of the source it was extracted
from, regardless of `source_type`.

Existing file uploads are not replaced by this model — `app/routers/documents.py`
still owns S3/Textract state for uploaded files via the `documents` table.
Uploading a file additionally creates a `sources` row (`source_type="file"`)
so obligations extracted from a document also have a `source_id` to
reference, keeping the origin of every obligation representable through
one unified concept.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SourceType = Literal["file", "text", "email", "whatsapp", "telegram"]

SourceProcessingStatus = Literal["pending", "processing", "completed", "failed"]


class StoredSource(BaseModel):
    """A source as persisted in DynamoDB and returned by the sources API."""

    source_id: str
    user_id: str
    source_type: SourceType
    title: str | None
    content: str | None
    original_reference: str | None
    created_at: str
    processing_status: SourceProcessingStatus


class SourceListResponse(BaseModel):
    """Response returned by GET /api/sources."""

    sources: list[StoredSource]
    count: int


class TextSourceRequest(BaseModel):
    """Request body for POST /api/sources/text."""

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, description="Optional short label for this source.")
    content: str = Field(min_length=1, description="The raw pasted text to extract obligations from.")


class TextSourceResponse(BaseModel):
    """Response returned after processing a pasted-text source."""

    source_id: str
    status: SourceProcessingStatus
    obligations: list["Obligation"] | None = None
    error: str | None = None


# Imported at the bottom to avoid a circular import at module load time:
# `Obligation` lives in `app.schemas.documents`, which does not import
# from this module.
from app.schemas.documents import Obligation  # noqa: E402

TextSourceResponse.model_rebuild()
