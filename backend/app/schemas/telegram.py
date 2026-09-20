"""Pydantic schemas for Telegram Bot API integration.

`TelegramUpdate`/`TelegramMessage`/`TelegramChat`/`TelegramUser` model
only the subset of Telegram's Bot API objects this integration actually
uses (https://core.telegram.org/bots/api#update,
https://core.telegram.org/bots/api#message). All Telegram-supplied
fields are treated as untrusted input from a third party — see
`app/routers/telegram.py`, which never uses this data to bypass OBLIGRA's
own authorization: it only ever resolves a `chat_id` to a `user_id` via
the linking table before doing anything scoped to a user.
"""

from pydantic import BaseModel, ConfigDict, Field


class LinkCodeResponse(BaseModel):
    """Response returned by POST /api/integrations/telegram/link-code."""

    code: str = Field(description="Send this to the bot as '/start <code>' to link your Telegram account.")
    expires_at: str


class TelegramUser(BaseModel):
    """Telegram's `User` object, as embedded in a message's `from` field."""

    model_config = ConfigDict(extra="ignore")

    id: int
    is_bot: bool = False
    first_name: str | None = None
    username: str | None = None


class TelegramChat(BaseModel):
    """Telegram's `Chat` object."""

    model_config = ConfigDict(extra="ignore")

    id: int
    type: str


class TelegramPhotoSize(BaseModel):
    """One entry in Telegram's `PhotoSize` array — a single resolution of an uploaded photo.

    Telegram sends the same photo at several resolutions in `message.photo`,
    ordered from smallest to largest; the last entry is always the
    highest-resolution one available (https://core.telegram.org/bots/api#photosize).
    """

    model_config = ConfigDict(extra="ignore")

    file_id: str
    file_unique_id: str
    width: int
    height: int
    file_size: int | None = None


class TelegramMessage(BaseModel):
    """Telegram's `Message` object (only the fields this integration reads)."""

    model_config = ConfigDict(extra="ignore")

    message_id: int
    date: int = Field(description="Unix timestamp (seconds) of when Telegram received the message.")
    chat: TelegramChat
    from_: TelegramUser | None = Field(default=None, alias="from")
    text: str | None = None
    photo: list[TelegramPhotoSize] | None = Field(
        default=None, description="Present when the message is a photo, ordered smallest to largest resolution."
    )


class TelegramUpdate(BaseModel):
    """Telegram's `Update` object — the top-level webhook payload shape.

    Only `message` updates are handled by this integration; other update
    types (edited messages, callback queries, channel posts, ...) are
    accepted (so Telegram never sees a parsing error and retries
    needlessly) but produce no obligations.
    """

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    update_id: int
    message: TelegramMessage | None = None
