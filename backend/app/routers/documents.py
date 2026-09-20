"""Document upload and text extraction endpoints.

Upload handling stores the file in S3 under a unique object key and kicks
off Amazon Textract text detection in the background. Document metadata
and extraction state are persisted in DynamoDB (see
`app/services/dynamodb_client.py`) — no in-memory or process-local store
is used. Obligation extraction results are also persisted to DynamoDB
automatically once Bedrock returns validated obligations. Dependency
detection and Bedrock model selection beyond what's configured are not
part of this module.

Every endpoint here requires authentication via
`app/dependencies/auth.get_current_user`, and every document lookup is
checked against the requesting user's ID — a document that exists but
belongs to a different user is treated identically to a document that
doesn't exist (404), so its existence is never leaked to someone who
doesn't own it.
"""

import asyncio
import io
import logging
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, status

from app.config import get_settings
from app.dependencies.auth import get_current_user
from app.schemas.documents import (
    DocumentListResponse,
    DocumentSummary,
    DocumentTextResponse,
    DocumentUploadResponse,
    ObligationExtractionResponse,
)
from app.services.bedrock_client import BedrockError, extract_obligations
from app.services.dynamodb_client import (
    DynamoDBError,
    create_document,
    create_source,
    get_document,
    list_documents,
    save_obligations,
    update_document_obligations_status,
    update_document_text_status,
    update_source_status,
)
from app.services.s3_client import S3UploadError, upload_fileobj
from app.services.textract_client import TextractError, extract_text

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])

# Maps allowed MIME types to the file extensions we accept for them.
_ALLOWED_EXTENSIONS_BY_CONTENT_TYPE = {
    "application/pdf": {".pdf"},
    "image/png": {".png"},
    "image/jpeg": {".jpg", ".jpeg"},
}


def _get_extension(filename: str) -> str:
    if "." not in filename:
        return ""
    return "." + filename.rsplit(".", 1)[-1].lower()


async def _read_and_validate_size(file: UploadFile, max_bytes: int) -> bytes:
    """Read the upload into memory while enforcing a hard size cap.

    Reads in chunks rather than trusting the client-supplied Content-Length
    header, so a mislabeled header cannot bypass the size limit.
    """
    chunk_size = 1024 * 1024  # 1 MB
    buffer = io.BytesIO()
    total = 0

    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=(
                    f"File exceeds the maximum allowed size of "
                    f"{max_bytes // (1024 * 1024)} MB."
                ),
            )
        buffer.write(chunk)

    buffer.seek(0)
    return buffer.getvalue()


async def _run_extraction(document_id: str, source_id: str, bucket: str, s3_key: str) -> None:
    """Background task: run Textract on the uploaded object and persist the result.

    The paired `sources` row (see `upload_document`) is kept in sync here:
    once Textract completes, the extracted text is also mirrored onto the
    source's `content` field and its `processing_status` updated, so the
    source is a faithful unified record of this document's text — the
    same shape a pasted-text source would already have.
    """
    try:
        text = await extract_text(bucket, s3_key)
        update_document_text_status(document_id, "completed", extracted_text=text)
        update_source_status(source_id, "completed", content=text)
    except TextractError as exc:
        logger.warning("Textract extraction failed for document %s: %s", document_id, exc)
        update_document_text_status(document_id, "failed", error=str(exc))
        update_source_status(source_id, "failed")
    except Exception:  # noqa: BLE001 - guard the background task from crashing silently
        logger.exception("Unexpected error extracting text for document %s", document_id)
        update_document_text_status(document_id, "failed", error="Text extraction failed.")
        update_source_status(source_id, "failed")


def _get_owned_document_or_404(document_id: str, user_id: str) -> dict:
    """Fetch a document and verify it belongs to `user_id`, or raise 404."""
    try:
        record = get_document(document_id)
    except DynamoDBError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to fetch document from storage.",
        ) from exc

    if record is None or record.get("user_id") != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    return record


@router.get("", response_model=DocumentListResponse)
async def list_my_documents(current_user: dict = Depends(get_current_user)) -> DocumentListResponse:
    """List documents uploaded by the current user."""
    try:
        records = list_documents(current_user["user_id"])
    except DynamoDBError as exc:
        logger.exception("Failed to list documents for user %s", current_user["user_id"])
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to fetch documents from storage.",
        ) from exc

    documents = [
        DocumentSummary(
            document_id=record["document_id"],
            filename=record["filename"],
            status=record["status"],
            obligations_status=record.get("obligations_status"),
            created_at=record["created_at"],
        )
        for record in records
    ]
    return DocumentListResponse(documents=documents, count=len(documents))


@router.post("/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
) -> DocumentUploadResponse:
    """Accept a PDF/PNG/JPEG file, store it in S3, and start text extraction.

    Validates content type, file extension, and size before uploading.
    Returns a generated document ID, the original filename, the S3 object
    key, and the processing status. Text extraction runs in the
    background; poll `GET /api/documents/{document_id}/text` for the
    result. The document is owned by the authenticated user.
    """
    settings = get_settings()

    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A filename is required.")

    content_type = file.content_type or ""
    if content_type not in settings.allowed_upload_content_types:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Unsupported file type '{content_type}'. Allowed types: "
                f"{', '.join(settings.allowed_upload_content_types)}."
            ),
        )

    extension = _get_extension(file.filename)
    allowed_extensions = _ALLOWED_EXTENSIONS_BY_CONTENT_TYPE.get(content_type, set())
    if extension not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"File extension '{extension}' does not match declared content "
                f"type '{content_type}'."
            ),
        )

    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    contents = await _read_and_validate_size(file, max_bytes)

    if not contents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

    document_id = str(uuid.uuid4())
    source_id = str(uuid.uuid4())
    timestamp = datetime.now(UTC).strftime("%Y/%m/%d")
    s3_key = f"{settings.s3_upload_prefix}{current_user['user_id']}/{timestamp}/{document_id}{extension}"

    try:
        upload_fileobj(io.BytesIO(contents), s3_key, content_type)
    except S3UploadError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to store the document. Please try again.",
        ) from exc

    try:
        create_document(
            document_id=document_id,
            user_id=current_user["user_id"],
            filename=file.filename,
            s3_key=s3_key,
            content_type=content_type,
            source_id=source_id,
        )
    except DynamoDBError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to save document metadata. Please try again.",
        ) from exc

    try:
        # Every document upload also gets a paired `sources` row so
        # obligations extracted from it can reference a unified
        # `source_id`, the same reference pasted-text (and future
        # email/WhatsApp/Telegram) obligations use. `content` starts as
        # None and is filled in by `_run_extraction` once Textract
        # completes; `original_reference` records the S3 key so the
        # source can always be traced back to the stored file.
        create_source(
            source_id=source_id,
            user_id=current_user["user_id"],
            source_type="file",
            title=file.filename,
            content=None,
            original_reference=s3_key,
            processing_status="processing",
        )
    except DynamoDBError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to save source metadata. Please try again.",
        ) from exc

    background_tasks.add_task(_run_extraction, document_id, source_id, settings.s3_bucket_name, s3_key)

    return DocumentUploadResponse(
        document_id=document_id,
        filename=file.filename,
        s3_key=s3_key,
        status="processing",
    )


@router.get("/{document_id}/text", response_model=DocumentTextResponse)
async def get_document_text(
    document_id: str, current_user: dict = Depends(get_current_user)
) -> DocumentTextResponse:
    """Return the extracted text for a previously uploaded document.

    `status` is one of `"processing"`, `"completed"`, or `"failed"`.
    While `"processing"`, `extracted_text` is `null` — poll again shortly.
    Only the document's owner can retrieve it.
    """
    record = _get_owned_document_or_404(document_id, current_user["user_id"])

    return DocumentTextResponse(
        document_id=record["document_id"],
        filename=record["filename"],
        extracted_text=record.get("extracted_text"),
        status=record["status"],
        error=record.get("error"),
    )


@router.post("/{document_id}/extract-obligations", response_model=ObligationExtractionResponse)
async def extract_document_obligations(
    document_id: str, current_user: dict = Depends(get_current_user)
) -> ObligationExtractionResponse:
    """Run AI obligation extraction on a document's already-extracted text.

    Requires that `GET /api/documents/{document_id}/text` has already
    reached `status: "completed"` for this document — obligation
    extraction runs on the Textract output, not on the raw file.
    Validated obligations are automatically persisted to DynamoDB, owned
    by the same user as the document; use
    `GET /api/obligations?document_id={document_id}` to retrieve them
    later. Only the document's owner can trigger extraction on it.
    """
    record = _get_owned_document_or_404(document_id, current_user["user_id"])

    extracted_text = record.get("extracted_text")
    if record["status"] != "completed" or not extracted_text:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Document text extraction has not completed yet. "
                "Wait for GET /api/documents/{document_id}/text to report status 'completed'."
            ),
        )

    update_document_obligations_status(document_id, "processing")

    try:
        obligations = await asyncio.to_thread(extract_obligations, extracted_text)
    except BedrockError as exc:
        logger.warning("Obligation extraction failed for document %s: %s", document_id, exc)
        update_document_obligations_status(document_id, "failed", error="Obligation extraction failed.")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to extract obligations. Please try again.",
        ) from exc
    except Exception as exc:  # noqa: BLE001 - surface unexpected errors as a clean 500 instead of crashing
        logger.exception("Unexpected error extracting obligations for document %s", document_id)
        update_document_obligations_status(document_id, "failed", error="Obligation extraction failed.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while extracting obligations.",
        ) from exc

    try:
        save_obligations(
            user_id=current_user["user_id"],
            obligations=obligations,
            source_id=record.get("source_id"),
            document_id=document_id,
        )
    except DynamoDBError as exc:
        logger.exception("Failed to save obligations for document %s", document_id)
        update_document_obligations_status(document_id, "failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Obligations were extracted but could not be saved. Please try again.",
        ) from exc

    update_document_obligations_status(document_id, "completed")

    return ObligationExtractionResponse(
        document_id=record["document_id"],
        filename=record["filename"],
        status="completed",
        obligations=obligations,
    )
