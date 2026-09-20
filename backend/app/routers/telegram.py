"""Telegram Bot API integration: account linking and message ingestion.

Telegram calls `POST /api/integrations/telegram/webhook` directly once a
webhook is registered via the Bot API's `setWebhook` — these requests
carry no OBLIGRA `Authorization` header, since Telegram has no knowledge
of our auth system. Two things follow from that:

1. This router cannot use `app/dependencies/auth.get_current_user` on the
   webhook route. Instead, incoming messages are attributed to an
   OBLIGRA user via `app/services/telegram_link_store.py`, which maps a
   Telegram `chat_id` to a `user_id` once the user has linked their
   account (see `link_telegram_account` below and the module docstring
   on `telegram_link_store.py` for the full linking flow).
2. The webhook endpoint should be protected some other way if reachable
   from the public internet — this integration supports checking
   Telegram's `X-Telegram-Bot-Api-Secret-Token` header against
   `settings.telegram_webhook_secret` (set via `setWebhook`'s
   `secret_token` parameter), but running without that secret configured
   is accepted for local development.

Every message that IS attributable to a linked user is converted into a
`sources` row (`source_type="telegram"`) and run through the exact same
Bedrock extraction + `save_obligations` pipeline as `POST
/api/sources/text` (see `app/routers/sources.py`) — no separate
obligation-processing path is introduced for Telegram.

Photo messages (screenshots) go through one extra step before that same
pipeline: the image is downloaded from Telegram via `getFile` +
`download_file`, uploaded to the existing OBLIGRA S3 bucket, and run
through the existing Textract OCR (`app/services/textract_client.py`) to
get plain text — from that point on it's the exact same
create-source → Bedrock → save-obligations flow as every other source
type. See `_process_photo_for_user` below.
"""

import asyncio
import io
import logging
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.config import get_settings
from app.dependencies.auth import get_current_user
from app.schemas.documents import Obligation
from app.schemas.telegram import LinkCodeResponse, TelegramPhotoSize, TelegramUpdate
from app.services.bedrock_client import BedrockError, extract_obligations
from app.services.dynamodb_client import DynamoDBError, create_source, save_obligations, update_source_status
from app.services.s3_client import S3UploadError, upload_fileobj
from app.services.telegram_client import (
    MAX_DOWNLOAD_SIZE_BYTES,
    TelegramError,
    TelegramNotConfiguredError,
    download_file,
    get_file_path,
    send_message,
)
from app.services.telegram_link_store import (
    DynamoDBError as TelegramLinkDynamoDBError,
    consume_link_code,
    create_link_code,
    get_user_id_for_chat,
    link_chat_to_user,
)
from app.services.textract_client import TextractError, extract_text

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/integrations/telegram", tags=["telegram"])

# Signature (first few bytes) of each image format Textract can process,
# used to validate a downloaded Telegram file actually is an image of a
# supported type before it's ever uploaded to S3 — Telegram's own
# `file_path` extension is not trusted for this (see `_detect_image_content_type`).
_IMAGE_SIGNATURES: dict[bytes, str] = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG\r\n\x1a\n": "image/png",
}


def _detect_image_content_type(content: bytes) -> str | None:
    """Return the detected MIME type of `content` by inspecting its leading bytes.

    Returns `None` if `content` doesn't match any supported image
    signature. Deliberately ignores whatever extension Telegram's
    `file_path` reports — a filename/extension is never proof of a
    file's actual content, so every downloaded file is sniffed by its
    real bytes before being trusted as an image.
    """
    for signature, content_type in _IMAGE_SIGNATURES.items():
        if content.startswith(signature):
            return content_type
    return None


def _verify_webhook_secret(x_telegram_bot_api_secret_token: str | None) -> None:
    """Reject the request if a webhook secret is configured and doesn't match.

    Telegram sets this header automatically once a secret is registered
    via `setWebhook`. If no secret is configured on this side (local
    development default), every request is accepted — see the module
    docstring for why that's an accepted tradeoff here.
    """
    settings = get_settings()
    if not settings.telegram_webhook_secret:
        return
    if x_telegram_bot_api_secret_token != settings.telegram_webhook_secret:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook secret.")


@router.post("/link-code", response_model=LinkCodeResponse, status_code=status.HTTP_201_CREATED)
async def create_telegram_link_code(current_user: dict = Depends(get_current_user)) -> LinkCodeResponse:
    """Generate a short-lived code linking a Telegram chat to the current OBLIGRA user.

    Send the returned code to the OBLIGRA Telegram bot as `/start <code>`
    to complete the link. The code expires after
    `settings.telegram_link_code_ttl_minutes` and can only be used once.
    """
    try:
        code, expires_at = create_link_code(current_user["user_id"])
    except TelegramLinkDynamoDBError as exc:
        logger.exception("Failed to create Telegram link code for user %s", current_user["user_id"])
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to generate a linking code. Please try again.",
        ) from exc

    return LinkCodeResponse(code=code, expires_at=expires_at)


def _handle_start_command(chat_id: int, text: str) -> str:
    """Handle a `/start <code>` or `/connect <code>` message: link the chat if the code is valid.

    Both commands are accepted and behave identically — `/start` is
    Telegram's own convention for a bot's first interaction (sent
    automatically when a user taps "Start"), while `/connect` is the
    more descriptive command this integration also documents to users.
    There is exactly one linking mechanism underneath; `/connect` is not
    a second, competing system.

    Returns the plain-text reply to send back to the user.
    """
    parts = text.split(maxsplit=1)
    if len(parts) < 2 or not parts[1].strip():
        return (
            "Welcome to OBLIGRA! To connect your Telegram account, generate a code from the "
            "OBLIGRA web app (Settings > Telegram) and send it here as /connect <code>."
        )

    code = parts[1].strip()

    try:
        user_id = consume_link_code(code)
    except TelegramLinkDynamoDBError as exc:
        logger.exception("Failed to consume Telegram link code")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to process the linking code. Please try again.",
        ) from exc

    if user_id is None:
        return (
            "That code is invalid or has expired. Generate a new one from the OBLIGRA web app "
            "and send it as /connect CODE."
        )

    try:
        link_chat_to_user(str(chat_id), user_id)
    except TelegramLinkDynamoDBError as exc:
        logger.exception("Failed to link Telegram chat %s to user %s", chat_id, user_id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to link your account. Please try again.",
        ) from exc

    return "Your Telegram account is now linked to OBLIGRA. Send any message and I'll extract its obligations."


def _process_message_for_user(user_id: str, chat_id: int, message_id: int, text: str) -> str:
    """Run a linked user's message through the unified source + obligation pipeline.

    Mirrors `app/routers/sources.py:create_text_source` exactly, with
    `source_type="telegram"` and `original_reference` set to a
    chat/message reference so the source can be traced back to the
    originating Telegram message. Returns the plain-text reply to send
    back to the user.
    """
    source_id = str(uuid.uuid4())
    original_reference = f"telegram:chat={chat_id}:message={message_id}"

    try:
        create_source(
            source_id=source_id,
            user_id=user_id,
            source_type="telegram",
            title=None,
            content=text,
            original_reference=original_reference,
            processing_status="processing",
        )
    except DynamoDBError as exc:
        logger.exception("Failed to create Telegram source for chat %s", chat_id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to save the message. Please try again.",
        ) from exc

    try:
        obligations = extract_obligations(text)
    except BedrockError as exc:
        logger.warning("Obligation extraction failed for Telegram source %s: %s", source_id, exc)
        update_source_status(source_id, "failed")
        return "I received your message but couldn't analyze it right now. Please try again shortly."
    except Exception:  # noqa: BLE001 - guard the webhook handler from crashing on unexpected errors
        logger.exception("Unexpected error extracting obligations for Telegram source %s", source_id)
        update_source_status(source_id, "failed")
        return "Something went wrong while analyzing your message. Please try again."

    try:
        save_obligations(user_id=user_id, obligations=obligations, source_id=source_id)
    except DynamoDBError:
        logger.exception("Failed to save obligations for Telegram source %s", source_id)
        update_source_status(source_id, "failed")
        return "I analyzed your message but couldn't save the result. Please try again."

    update_source_status(source_id, "completed")

    if not obligations:
        return "Got it — I didn't find any actionable obligations in that message."

    summary = "; ".join(o.action for o in obligations if o.action) or f"{len(obligations)} obligation(s)"
    return f"Got it — found {len(obligations)} obligation(s): {summary}. View them in the OBLIGRA app."


def _format_obligations_reply(obligations: list[Obligation]) -> str:
    """Build the confirmation message sent back to the user after processing a screenshot."""
    if not obligations:
        return "No actionable obligations were found in this screenshot."

    lines = [f"Screenshot processed by OBLIGRA.\n\n{len(obligations)} obligation(s) detected.\n"]
    for index, obligation in enumerate(obligations, start=1):
        action = obligation.action or "Unspecified action"
        if obligation.deadline:
            lines.append(f"{index}. {action} — {obligation.deadline}")
        else:
            lines.append(f"{index}. {action}")
    lines.append("\nOpen OBLIGRA to view dependencies and risks.")
    return "\n".join(lines)


def _process_photo_for_user(
    user_id: str, chat_id: int, message_id: int, telegram_user_id: int, photo: TelegramPhotoSize
) -> str:
    """Run a linked user's screenshot through the unified source + OCR + obligation pipeline.

    Mirrors the existing file-upload flow (`app/routers/documents.py`)
    and the text-message flow above: download the image from Telegram,
    store it in the existing S3 bucket, create a `sources` row
    (`source_type="telegram"`), run the existing Textract OCR, then the
    existing Bedrock extraction, then the existing obligation
    persistence. No Telegram-specific OCR or extraction logic exists —
    every step after the S3 upload calls the exact same service
    functions the file-upload and text-message paths already use.
    Returns the plain-text reply to send back to the user.
    """
    settings = get_settings()

    try:
        file_path, reported_size = get_file_path(photo.file_id)
    except TelegramError as exc:
        logger.warning("Failed to resolve Telegram file_id for chat %s: %s", chat_id, exc)
        return "I couldn't download that screenshot from Telegram. Please try sending it again."

    if reported_size is not None and reported_size > MAX_DOWNLOAD_SIZE_BYTES:
        return "That image is too large. Please send a smaller screenshot."

    try:
        content = download_file(file_path)
    except TelegramError as exc:
        logger.warning("Failed to download Telegram file for chat %s: %s", chat_id, exc)
        return "I couldn't download that screenshot from Telegram. Please try sending it again."

    content_type = _detect_image_content_type(content)
    if content_type is None:
        logger.warning("Rejected Telegram file for chat %s: unrecognized image format", chat_id)
        return "I couldn't read that file as an image. Please send a JPEG or PNG screenshot."

    extension = ".jpg" if content_type == "image/jpeg" else ".png"
    object_key = f"telegram/{telegram_user_id}/{uuid.uuid4()}{extension}"

    try:
        upload_fileobj(io.BytesIO(content), object_key, content_type)
    except S3UploadError as exc:
        logger.exception("Failed to upload Telegram screenshot to S3 for chat %s: %s", chat_id, exc)
        return "I received your screenshot but couldn't store it right now. Please try again."

    source_id = str(uuid.uuid4())
    try:
        create_source(
            source_id=source_id,
            user_id=user_id,
            source_type="telegram",
            title="Telegram Screenshot",
            content=None,
            original_reference=str(message_id),
            processing_status="processing",
        )
    except DynamoDBError:
        logger.exception("Failed to create Telegram screenshot source for chat %s", chat_id)
        return "I received your screenshot but couldn't save it right now. Please try again."

    try:
        text = asyncio.run(extract_text(settings.s3_bucket_name, object_key))
    except TextractError as exc:
        logger.warning("Textract failed for Telegram screenshot source %s: %s", source_id, exc)
        update_source_status(source_id, "failed")
        return "I couldn't read the screenshot clearly. Please send a clearer image."
    except Exception:  # noqa: BLE001 - guard the webhook handler from crashing on unexpected errors
        logger.exception("Unexpected error running OCR for Telegram screenshot source %s", source_id)
        update_source_status(source_id, "failed")
        return "I couldn't read the screenshot clearly. Please send a clearer image."

    if not text.strip():
        update_source_status(source_id, "completed", content=text)
        return "I couldn't read the screenshot clearly. Please send a clearer image."

    try:
        obligations = extract_obligations(text)
    except BedrockError as exc:
        logger.warning("Obligation extraction failed for Telegram screenshot source %s: %s", source_id, exc)
        update_source_status(source_id, "failed", content=text)
        return "I read the screenshot but couldn't analyze it right now. Please try again shortly."
    except Exception:  # noqa: BLE001 - guard the webhook handler from crashing on unexpected errors
        logger.exception(
            "Unexpected error extracting obligations for Telegram screenshot source %s", source_id
        )
        update_source_status(source_id, "failed", content=text)
        return "Something went wrong while analyzing your screenshot. Please try again."

    try:
        save_obligations(user_id=user_id, obligations=obligations, source_id=source_id)
    except DynamoDBError:
        logger.exception("Failed to save obligations for Telegram screenshot source %s", source_id)
        update_source_status(source_id, "failed", content=text)
        return "I analyzed your screenshot but couldn't save the result. Please try again."

    update_source_status(source_id, "completed", content=text)

    return _format_obligations_reply(obligations)


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def telegram_webhook(
    update: TelegramUpdate,
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
) -> dict:
    """Receive an incoming Telegram update and process it.

    Always returns 200 with a small JSON body (Telegram interprets a
    non-200 response, or excessive latency, as a delivery failure and
    will retry the same update — returning 200 even for updates we
    couldn't fully process, e.g. an unlinked chat, avoids Telegram
    retrying something that will just fail the same way again).
    """
    _verify_webhook_secret(x_telegram_bot_api_secret_token)

    if update.message is None:
        # Non-message updates (edits, callback queries, ...) produce
        # nothing to extract.
        return {"ok": True}

    message = update.message
    chat_id = message.chat.id
    is_photo = bool(message.photo)

    if not is_photo and not message.text:
        # Messages with no text and no photo (stickers, voice notes, ...)
        # produce nothing to extract.
        return {"ok": True}

    logger.info(
        "Received Telegram %s %s from chat %s at %s",
        "photo" if is_photo else "message",
        message.message_id,
        chat_id,
        message.date,
    )

    if is_photo:
        try:
            user_id = get_user_id_for_chat(str(chat_id))
        except TelegramLinkDynamoDBError as exc:
            logger.exception("Failed to look up Telegram link for chat %s", chat_id)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to process this screenshot. Please try again.",
            ) from exc

        if user_id is None:
            reply = "Please connect your OBLIGRA account first using /connect CODE."
        else:
            # Telegram orders `photo` from smallest to largest resolution;
            # the last entry is always the highest-resolution version
            # available (https://core.telegram.org/bots/api#photosize).
            highest_resolution_photo = message.photo[-1]
            telegram_user_id = message.from_.id if message.from_ else chat_id
            reply = await asyncio.to_thread(
                _process_photo_for_user,
                user_id,
                chat_id,
                message.message_id,
                telegram_user_id,
                highest_resolution_photo,
            )
    else:
        text = message.text
        if text.startswith("/start") or text.startswith("/connect"):
            reply = await asyncio.to_thread(_handle_start_command, chat_id, text)
        else:
            try:
                user_id = get_user_id_for_chat(str(chat_id))
            except TelegramLinkDynamoDBError as exc:
                logger.exception("Failed to look up Telegram link for chat %s", chat_id)
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Failed to process this message. Please try again.",
                ) from exc

            if user_id is None:
                reply = "Please connect your OBLIGRA account first using /connect CODE."
            else:
                reply = await asyncio.to_thread(
                    _process_message_for_user, user_id, chat_id, message.message_id, text
                )

    try:
        send_message(chat_id, reply)
    except TelegramNotConfiguredError:
        logger.warning("TELEGRAM_BOT_TOKEN is not configured; could not reply to chat %s", chat_id)
    except TelegramError as exc:
        # The message was already processed and persisted (if applicable)
        # by this point — failing to send the confirmation back over
        # Telegram is logged but must not turn into a 5xx response, since
        # that would make Telegram retry an update that already succeeded.
        logger.warning("Failed to send Telegram reply to chat %s: %s", chat_id, exc)

    return {"ok": True}
