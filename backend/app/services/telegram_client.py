"""Thin wrapper over the official Telegram Bot API.

Only the calls this integration needs are implemented — `sendMessage`,
`getFile`, and downloading a file's bytes — there is no general-purpose
Telegram SDK dependency here, matching the rest of this codebase's
pattern of small, single-purpose service modules per external API (see
`s3_client.py`, `textract_client.py`, `bedrock_client.py`).

The Bot API is plain HTTPS + JSON (https://core.telegram.org/bots/api),
called here via `httpx` since boto3 has no Telegram support.
"""

import logging

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

_API_BASE = "https://api.telegram.org"
_REQUEST_TIMEOUT_SECONDS = 10.0
_DOWNLOAD_TIMEOUT_SECONDS = 30.0
# Telegram Bot API's own hard cap on file downloads via the Bot API is
# 20 MB; this is set slightly below that as a defensive client-side
# check so an unexpectedly large `file_size` is rejected before ever
# attempting the download.
MAX_DOWNLOAD_SIZE_BYTES = 20 * 1024 * 1024


class TelegramError(RuntimeError):
    """Raised when a call to the Telegram Bot API fails."""


class TelegramNotConfiguredError(TelegramError):
    """Raised when `TELEGRAM_BOT_TOKEN` is not set."""


def _require_token() -> str:
    settings = get_settings()
    if not settings.telegram_bot_token:
        raise TelegramNotConfiguredError(
            "TELEGRAM_BOT_TOKEN is not configured. Set it in the environment to enable Telegram integration."
        )
    return settings.telegram_bot_token


def send_message(chat_id: int | str, text: str) -> None:
    """Send a plain-text message to a Telegram chat via `sendMessage`.

    Best-effort in the sense that callers should treat a failure here as
    non-fatal to whatever triggered it (e.g. obligations were already
    extracted and saved; failing to also confirm that back to the user
    over Telegram shouldn't undo the save) — but this function itself
    always raises `TelegramError` on failure rather than swallowing it,
    so the caller can decide how to log/handle it.
    """
    token = _require_token()
    url = f"{_API_BASE}/bot{token}/sendMessage"

    try:
        response = httpx.post(
            url,
            json={"chat_id": chat_id, "text": text},
            timeout=_REQUEST_TIMEOUT_SECONDS,
        )
    except httpx.HTTPError as exc:
        raise TelegramError(f"Failed to reach the Telegram API: {exc}") from exc

    if response.status_code != 200:
        raise TelegramError(
            f"Telegram API returned status {response.status_code}: {response.text}"
        )

    body = response.json()
    if not body.get("ok", False):
        raise TelegramError(f"Telegram API reported failure: {body}")


def delete_message(chat_id: int | str, message_id: int) -> None:
    """Delete a message in a chat via `deleteMessage`.

    Used to scrub the `/login <email> <password>` command from the chat
    immediately after processing it, since Telegram has no concept of a
    masked/password-style input for bot commands — the password is
    otherwise left sitting in plaintext in the chat history on both the
    user's device and Telegram's servers. Telegram only allows a bot to
    delete messages in a private chat within 48 hours of being sent, so
    this is best-effort: failures are logged, never raised, since the
    login itself has already succeeded or failed by the time this runs
    and a failed cleanup must not undo that outcome or crash the webhook.
    """
    token = _require_token()
    url = f"{_API_BASE}/bot{token}/deleteMessage"

    try:
        response = httpx.post(
            url,
            json={"chat_id": chat_id, "message_id": message_id},
            timeout=_REQUEST_TIMEOUT_SECONDS,
        )
        body = response.json()
    except httpx.HTTPError as exc:
        logger.warning("Failed to reach Telegram API to delete message %s in chat %s: %s", message_id, chat_id, exc)
        return

    if response.status_code != 200 or not body.get("ok", False):
        logger.warning(
            "Telegram declined to delete message %s in chat %s: %s", message_id, chat_id, body
        )


def get_file_path(file_id: str) -> tuple[str, int | None]:
    """Resolve a Telegram `file_id` to a downloadable `file_path`, via `getFile`.

    Returns `(file_path, file_size)`. `file_size` is `None` if Telegram
    didn't report it. Raises `TelegramError` on any failure, including a
    `file_id` that Telegram no longer recognizes (file IDs are not
    permanent).
    """
    token = _require_token()
    url = f"{_API_BASE}/bot{token}/getFile"

    try:
        response = httpx.get(url, params={"file_id": file_id}, timeout=_REQUEST_TIMEOUT_SECONDS)
    except httpx.HTTPError as exc:
        raise TelegramError(f"Failed to reach the Telegram API: {exc}") from exc

    if response.status_code != 200:
        raise TelegramError(f"Telegram API returned status {response.status_code}: {response.text}")

    body = response.json()
    if not body.get("ok", False):
        raise TelegramError(f"Telegram API reported failure: {body}")

    result = body.get("result", {})
    file_path = result.get("file_path")
    if not file_path:
        raise TelegramError("Telegram API did not return a file_path for this file_id.")

    return file_path, result.get("file_size")


def download_file(file_path: str) -> bytes:
    """Download a file's raw bytes from Telegram, given a `file_path` from `getFile`.

    `file_path` must come from a `getFile` response for this exact bot's
    token — Telegram scopes file downloads to the bot that requested
    `getFile`, so this is not a general-purpose URL fetch. The download
    URL embeds the bot token (this is how the official Bot API's file
    download endpoint works: `https://api.telegram.org/file/bot<token>/<file_path>`),
    so this function, like every other call in this module, must never
    have its resulting URL logged or exposed to a caller outside this
    process.
    """
    token = _require_token()
    url = f"{_API_BASE}/file/bot{token}/{file_path}"

    try:
        response = httpx.get(url, timeout=_DOWNLOAD_TIMEOUT_SECONDS)
    except httpx.HTTPError as exc:
        raise TelegramError(f"Failed to download file from Telegram: {exc}") from exc

    if response.status_code != 200:
        raise TelegramError(f"Telegram file download returned status {response.status_code}.")

    content = response.content
    if len(content) > MAX_DOWNLOAD_SIZE_BYTES:
        raise TelegramError(
            f"Downloaded file exceeds the maximum allowed size of {MAX_DOWNLOAD_SIZE_BYTES // (1024 * 1024)} MB."
        )

    return content
