"""Unified source endpoints: pasted text, and listing all of a user's sources.

A "source" is any raw input that can be turned into obligations via the
same Bedrock extraction pipeline used for uploaded documents — currently
`file` (created automatically by `app/routers/documents.py` on upload)
and `text` (pasted directly by the user here). `email`, `whatsapp`, and
`telegram` are recognized `source_type` values for forward compatibility
but have no ingestion endpoint yet — that integration work is out of
scope for this stage.

Every endpoint here requires authentication via
`app/dependencies/auth.get_current_user`, and every source lookup is
scoped to the requesting user's own sources.
"""

import asyncio
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies.auth import get_current_user
from app.schemas.sources import SourceListResponse, TextSourceRequest, TextSourceResponse
from app.services.bedrock_client import BedrockError, extract_obligations
from app.services.dynamodb_client import (
    DynamoDBError,
    create_source,
    list_sources,
    save_obligations,
    update_source_status,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("", response_model=SourceListResponse)
async def list_my_sources(current_user: dict = Depends(get_current_user)) -> SourceListResponse:
    """List all sources (files, pasted text, ...) owned by the current user."""
    try:
        sources = list_sources(current_user["user_id"])
    except DynamoDBError as exc:
        logger.exception("Failed to list sources for user %s", current_user["user_id"])
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to fetch sources from storage.",
        ) from exc

    return SourceListResponse(sources=sources, count=len(sources))


@router.post("/text", response_model=TextSourceResponse, status_code=status.HTTP_201_CREATED)
async def create_text_source(
    body: TextSourceRequest, current_user: dict = Depends(get_current_user)
) -> TextSourceResponse:
    """Paste plain text and run it through the same obligation-extraction pipeline as file uploads.

    Unlike file uploads, no Textract step is needed — the pasted text is
    already plain text, so it is sent to Bedrock directly. A `sources` row
    is created up front (`source_type="text"`) so the resulting
    obligations reference a `source_id` the same way file-derived
    obligations do; use `GET /api/obligations?source_id={source_id}` to
    retrieve them afterward.
    """
    source_id = str(uuid.uuid4())

    try:
        create_source(
            source_id=source_id,
            user_id=current_user["user_id"],
            source_type="text",
            title=body.title,
            content=body.content,
            original_reference=None,
            processing_status="processing",
        )
    except DynamoDBError as exc:
        logger.exception("Failed to create text source")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to save source. Please try again.",
        ) from exc

    try:
        obligations = await asyncio.to_thread(extract_obligations, body.content)
    except BedrockError as exc:
        logger.warning("Obligation extraction failed for source %s: %s", source_id, exc)
        update_source_status(source_id, "failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to extract obligations: {exc}",
        ) from exc
    except Exception as exc:  # noqa: BLE001 - surface unexpected errors as a clean 500 instead of crashing
        logger.exception("Unexpected error extracting obligations for source %s", source_id)
        update_source_status(source_id, "failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while extracting obligations.",
        ) from exc

    try:
        save_obligations(user_id=current_user["user_id"], obligations=obligations, source_id=source_id)
    except DynamoDBError as exc:
        logger.exception("Failed to save obligations for source %s", source_id)
        update_source_status(source_id, "failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Obligations were extracted but could not be saved. Please try again.",
        ) from exc

    update_source_status(source_id, "completed")

    return TextSourceResponse(source_id=source_id, status="completed", obligations=obligations)
