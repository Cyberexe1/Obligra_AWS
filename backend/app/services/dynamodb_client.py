"""DynamoDB persistence for documents and obligations.

Credentials are never read or handled directly by this module — see
`app/services/s3_client.py` for the same convention. boto3 resolves AWS
credentials via its default chain (environment variables, shared config,
or an attached IAM role).

Four tables are used:
  - documents table: one item per uploaded document (metadata + Textract
    extraction state).
  - sources table: one item per unified input (file, pasted text, and in
    the future email/WhatsApp/Telegram messages). Every document upload
    also creates a source row (`source_type="file"`) so obligations
    extracted from it can reference a `source_id` the same way obligations
    from any other input type do.
  - obligations table: one item per extracted obligation, with a GSI on
    `user_id` (partitioned by user, sorted by `created_at`) so a user's
    obligations can be listed without a full table scan. Each obligation
    carries a `source_id` (its unified origin reference) and, when it came
    from a file upload, a `document_id` kept for backward compatibility.
  - obligation relationships table: used by dependency detection between
    obligations.
"""

import logging
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from functools import lru_cache
from typing import Literal

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import BotoCoreError, ClientError

from app.config import get_settings
from app.schemas.documents import DetectedRelationship, Obligation, ObligationStatus, StoredObligation, StoredRelationship
from app.schemas.sources import SourceProcessingStatus, SourceType, StoredSource

logger = logging.getLogger(__name__)

DocumentStatus = Literal["processing", "completed", "failed"]


class DynamoDBError(RuntimeError):
    """Raised when a DynamoDB read or write fails."""


@lru_cache
def _get_resource():
    settings = get_settings()
    return boto3.resource("dynamodb", region_name=settings.aws_region)


def _documents_table():
    settings = get_settings()
    return _get_resource().Table(settings.dynamodb_documents_table)


def _obligations_table():
    settings = get_settings()
    return _get_resource().Table(settings.dynamodb_obligations_table)


def _relationships_table():
    settings = get_settings()
    return _get_resource().Table(settings.dynamodb_obligation_relationships_table)


def _sources_table():
    settings = get_settings()
    return _get_resource().Table(settings.dynamodb_sources_table)


# --- Documents ---------------------------------------------------------


def create_document(
    document_id: str, user_id: str, filename: str, s3_key: str, content_type: str, source_id: str | None = None
) -> None:
    """Create the initial DynamoDB item for a newly uploaded document.

    `user_id` records ownership — every read of this document must be
    checked against the requesting user's ID by the caller (routers do
    this via `app/dependencies/auth.get_current_user`), since DynamoDB
    itself does not enforce authorization. `source_id` links this
    document to its paired `sources` row (`source_type="file"`), created
    alongside it so obligations extracted from this document can carry a
    unified `source_id` reference.
    """
    now = datetime.now(UTC).isoformat()
    item = {
        "document_id": document_id,
        "user_id": user_id,
        "filename": filename,
        "s3_key": s3_key,
        "content_type": content_type,
        "source_id": source_id,
        "status": "processing",
        "extracted_text": None,
        "error": None,
        "obligations_status": None,
        "obligations_error": None,
        "created_at": now,
        "updated_at": now,
    }
    try:
        _documents_table().put_item(Item=item)
    except (BotoCoreError, ClientError) as exc:
        raise DynamoDBError(f"Failed to create document record: {exc}") from exc


def get_document(document_id: str) -> dict | None:
    """Return the raw document item, or None if it doesn't exist.

    Does NOT check ownership — callers must compare the returned item's
    `user_id` against the requesting user before using or exposing it.
    """
    try:
        response = _documents_table().get_item(Key={"document_id": document_id})
    except (BotoCoreError, ClientError) as exc:
        raise DynamoDBError(f"Failed to fetch document record: {exc}") from exc
    return response.get("Item")


def list_documents(user_id: str) -> list[dict]:
    """List all documents owned by the given user, via the `user_id-created_at-index` GSI."""
    try:
        response = _documents_table().query(
            IndexName="user_id-created_at-index",
            KeyConditionExpression=Key("user_id").eq(user_id),
        )
    except (BotoCoreError, ClientError) as exc:
        raise DynamoDBError(f"Failed to list documents: {exc}") from exc
    return response.get("Items", [])


def update_document_text_status(
    document_id: str,
    status: DocumentStatus,
    extracted_text: str | None = None,
    error: str | None = None,
) -> None:
    """Update a document's Textract extraction status/result."""
    try:
        _documents_table().update_item(
            Key={"document_id": document_id},
            UpdateExpression=(
                "SET #status = :status, extracted_text = :text, "
                "#error = :error, updated_at = :updated_at"
            ),
            ExpressionAttributeNames={"#status": "status", "#error": "error"},
            ExpressionAttributeValues={
                ":status": status,
                ":text": extracted_text,
                ":error": error,
                ":updated_at": datetime.now(UTC).isoformat(),
            },
        )
    except (BotoCoreError, ClientError) as exc:
        raise DynamoDBError(f"Failed to update document text status: {exc}") from exc


def update_document_obligations_status(
    document_id: str,
    status: DocumentStatus,
    error: str | None = None,
) -> None:
    """Update a document's obligation-extraction (Bedrock) status."""
    try:
        _documents_table().update_item(
            Key={"document_id": document_id},
            UpdateExpression=(
                "SET obligations_status = :status, obligations_error = :error, "
                "updated_at = :updated_at"
            ),
            ExpressionAttributeValues={
                ":status": status,
                ":error": error,
                ":updated_at": datetime.now(UTC).isoformat(),
            },
        )
    except (BotoCoreError, ClientError) as exc:
        raise DynamoDBError(f"Failed to update document obligations status: {exc}") from exc


# --- Sources --------------------------------------------------------------


def create_source(
    source_id: str,
    user_id: str,
    source_type: SourceType,
    title: str | None = None,
    content: str | None = None,
    original_reference: str | None = None,
    processing_status: SourceProcessingStatus = "pending",
) -> StoredSource:
    """Create a new source item and return the stored record.

    `user_id` records ownership, following the same convention as
    `create_document` — every read must be checked against the requesting
    user by the caller, since DynamoDB does not enforce authorization.
    """
    now = datetime.now(UTC).isoformat()
    item = {
        "source_id": source_id,
        "user_id": user_id,
        "source_type": source_type,
        "title": title,
        "content": content,
        "original_reference": original_reference,
        "created_at": now,
        "processing_status": processing_status,
    }
    try:
        _sources_table().put_item(Item=item)
    except (BotoCoreError, ClientError) as exc:
        raise DynamoDBError(f"Failed to create source record: {exc}") from exc
    return StoredSource.model_validate(item)


def get_source(source_id: str) -> dict | None:
    """Return the raw source item, or None if it doesn't exist.

    Does NOT check ownership — callers must compare the returned item's
    `user_id` against the requesting user before using or exposing it.
    """
    try:
        response = _sources_table().get_item(Key={"source_id": source_id})
    except (BotoCoreError, ClientError) as exc:
        raise DynamoDBError(f"Failed to fetch source record: {exc}") from exc
    return response.get("Item")


def list_sources(user_id: str) -> list[StoredSource]:
    """List all sources owned by the given user, via the `user_id-created_at-index` GSI."""
    try:
        response = _sources_table().query(
            IndexName="user_id-created_at-index",
            KeyConditionExpression=Key("user_id").eq(user_id),
        )
    except (BotoCoreError, ClientError) as exc:
        raise DynamoDBError(f"Failed to list sources: {exc}") from exc
    items = response.get("Items", [])
    return [StoredSource.model_validate(item) for item in items]


def update_source_status(
    source_id: str,
    processing_status: SourceProcessingStatus,
    content: str | None = None,
) -> None:
    """Update a source's processing status and, optionally, its content.

    `content` is only overwritten when explicitly provided (e.g. once a
    document's Textract extraction completes and its text becomes
    available) — passing `None` leaves the stored content untouched.
    """
    update_expression = "SET processing_status = :status"
    expression_values: dict = {":status": processing_status}

    if content is not None:
        update_expression += ", content = :content"
        expression_values[":content"] = content

    try:
        _sources_table().update_item(
            Key={"source_id": source_id},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_values,
        )
    except (BotoCoreError, ClientError) as exc:
        raise DynamoDBError(f"Failed to update source status: {exc}") from exc


# --- Obligations --------------------------------------------------------


def save_obligations(
    user_id: str,
    obligations: list[Obligation],
    source_id: str | None = None,
    document_id: str | None = None,
) -> list[StoredObligation]:
    """Persist validated obligations and return the stored records.

    Every obligation should be given a `source_id` — it is the unified
    reference to whatever produced it (an uploaded file, pasted text,
    etc; see `app/schemas/sources.py`). `document_id` is additionally
    populated when the source is a file upload, purely for backward
    compatibility with the original document-only flow (e.g. the
    `document_id` filter on `GET /api/obligations`); new source types
    have no document at all, so both parameters are optional, though
    callers should always supply at least `source_id` going forward.

    Each obligation is assigned a fresh `obligation_id`, `created_at`
    timestamp, and starts in `"pending"` status. `user_id` is denormalized
    onto every obligation item (rather than only on its parent source)
    because obligations are looked up standalone by `obligation_id` in
    several places, and each of those lookups needs to check ownership
    without an extra round-trip to fetch the parent record first.
    DynamoDB's low-level API has no native float type, so `confidence` is
    converted to `Decimal` before writing (boto3 does not do this
    conversion automatically).
    """
    table = _obligations_table()
    stored: list[StoredObligation] = []
    now = datetime.now(UTC).isoformat()

    try:
        with table.batch_writer() as batch:
            for obligation in obligations:
                obligation_id = str(uuid.uuid4())
                item = {
                    "obligation_id": obligation_id,
                    "user_id": user_id,
                    "action": obligation.action,
                    "deadline": obligation.deadline,
                    "condition": obligation.condition,
                    "source": obligation.source,
                    "consequence": obligation.consequence,
                    "confidence": Decimal(str(obligation.confidence)),
                    "status": "pending",
                    "created_at": now,
                }
                # `document_id` is a GSI key on this table (`document_id-created_at-index`,
                # kept from before the sources layer existed). DynamoDB
                # rejects writing a GSI key attribute as an explicit NULL,
                # so it must be omitted entirely rather than set to None
                # when an obligation has no document (e.g. text sources).
                # Same reasoning applies defensively to `source_id`.
                if document_id is not None:
                    item["document_id"] = document_id
                if source_id is not None:
                    item["source_id"] = source_id

                batch.put_item(Item=item)
                stored.append(
                    StoredObligation.model_validate({**item, "confidence": obligation.confidence})
                )
    except (BotoCoreError, ClientError) as exc:
        raise DynamoDBError(f"Failed to save obligations: {exc}") from exc

    return stored


def get_obligation_raw(obligation_id: str) -> dict | None:
    """Fetch a single obligation's raw item (including `user_id`), or None.

    Does NOT check ownership — callers must compare the returned item's
    `user_id` against the requesting user before using or exposing it.
    """
    try:
        response = _obligations_table().get_item(Key={"obligation_id": obligation_id})
    except (BotoCoreError, ClientError) as exc:
        raise DynamoDBError(f"Failed to fetch obligation: {exc}") from exc
    return response.get("Item")


def get_obligation(obligation_id: str) -> StoredObligation | None:
    """Fetch a single obligation by its ID, validated into `StoredObligation`."""
    item = get_obligation_raw(obligation_id)
    if item is None:
        return None
    return StoredObligation.model_validate(item)


def list_obligations(
    user_id: str, document_id: str | None = None, source_id: str | None = None
) -> list[StoredObligation]:
    """List obligations owned by `user_id`, optionally filtered further by document or source ID.

    `user_id` is required (not optional) specifically so this can never
    be called in a way that returns another user's obligations. Uses the
    `user_id-created_at-index` GSI, then filters by `document_id`/`source_id`
    in Python if either filter is also supplied — the obligations table
    isn't expected to grow large enough per-user for this to matter, and
    it avoids needing extra composite indexes just for these secondary
    filters.
    """
    table = _obligations_table()

    try:
        response = table.query(
            IndexName="user_id-created_at-index",
            KeyConditionExpression=Key("user_id").eq(user_id),
        )
    except (BotoCoreError, ClientError) as exc:
        raise DynamoDBError(f"Failed to list obligations: {exc}") from exc

    items = response.get("Items", [])
    if document_id is not None:
        items = [item for item in items if item.get("document_id") == document_id]
    if source_id is not None:
        items = [item for item in items if item.get("source_id") == source_id]

    return [StoredObligation.model_validate(item) for item in items]


def update_obligation_status(obligation_id: str, user_id: str, new_status: ObligationStatus) -> StoredObligation | None:
    """Update an obligation's status, if it exists AND belongs to `user_id`.

    Returns `None` if the obligation doesn't exist or belongs to a
    different user — both cases are treated identically here so the
    router can return a 404 without distinguishing "doesn't exist" from
    "exists but isn't yours" (the latter would leak the obligation's
    existence to a user who shouldn't be able to see it at all).
    """
    table = _obligations_table()

    try:
        table.update_item(
            Key={"obligation_id": obligation_id},
            UpdateExpression="SET #status = :status",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":status": new_status, ":owner_id": user_id},
            ConditionExpression="attribute_exists(obligation_id) AND user_id = :owner_id",
        )
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return None
        raise DynamoDBError(f"Failed to update obligation status: {exc}") from exc
    except BotoCoreError as exc:
        raise DynamoDBError(f"Failed to update obligation status: {exc}") from exc

    return get_obligation(obligation_id)


# --- Obligation relationships --------------------------------------------


def save_relationships(relationships: list[DetectedRelationship]) -> list[StoredRelationship]:
    """Persist detected dependency relationships and return the stored records.

    Each relationship is assigned a fresh `relationship_id` and
    `created_at` timestamp. `confidence` is converted to `Decimal` before
    writing, for the same reason as in `save_obligations`.
    """
    table = _relationships_table()
    stored: list[StoredRelationship] = []
    now = datetime.now(UTC).isoformat()

    try:
        with table.batch_writer() as batch:
            for relationship in relationships:
                relationship_id = str(uuid.uuid4())
                item = {
                    "relationship_id": relationship_id,
                    "from_obligation_id": relationship.from_obligation_id,
                    "to_obligation_id": relationship.to_obligation_id,
                    "relationship_type": relationship.relationship_type,
                    "reason": relationship.reason,
                    "confidence": Decimal(str(relationship.confidence)),
                    "created_at": now,
                }
                batch.put_item(Item=item)
                stored.append(
                    StoredRelationship.model_validate({**item, "confidence": relationship.confidence})
                )
    except (BotoCoreError, ClientError) as exc:
        raise DynamoDBError(f"Failed to save relationships: {exc}") from exc

    return stored


def list_relationships(obligation_ids: set[str] | None = None) -> list[StoredRelationship]:
    """List persisted obligation relationships.

    The relationships table has no `user_id` of its own — a relationship
    only ever connects two obligations, and a relationship is only ever
    detected between obligations belonging to the same user (dependency
    detection only ever runs over one user's obligations at a time). So
    ownership is enforced here by filtering to relationships where BOTH
    endpoints are in the caller-supplied `obligation_ids` set (typically
    "all of the current user's obligation IDs"), rather than duplicating
    `user_id` onto every relationship item.

    If `obligation_ids` is `None`, all relationships are returned
    unfiltered — callers must only do this when they've already
    established there's no cross-user leakage risk (there is currently no
    such caller; every router-level use passes the scoping set).
    """
    try:
        response = _relationships_table().scan()
    except (BotoCoreError, ClientError) as exc:
        raise DynamoDBError(f"Failed to list relationships: {exc}") from exc

    items = response.get("Items", [])
    if obligation_ids is not None:
        items = [
            item
            for item in items
            if item.get("from_obligation_id") in obligation_ids and item.get("to_obligation_id") in obligation_ids
        ]

    return [StoredRelationship.model_validate(item) for item in items]


def clear_relationships(obligation_ids: set[str]) -> None:
    """Delete relationships where both endpoints are in `obligation_ids`.

    Used before re-running dependency analysis so stale relationships
    from a previous run don't linger alongside newly detected ones.
    Scoped to the given obligation IDs (typically "the current user's
    obligations") so one user re-running analysis can never delete
    another user's relationships.
    """
    table = _relationships_table()
    try:
        existing = table.scan()
        with table.batch_writer() as batch:
            for item in existing.get("Items", []):
                if item.get("from_obligation_id") in obligation_ids and item.get("to_obligation_id") in obligation_ids:
                    batch.delete_item(Key={"relationship_id": item["relationship_id"]})
    except (BotoCoreError, ClientError) as exc:
        raise DynamoDBError(f"Failed to clear existing relationships: {exc}") from exc
