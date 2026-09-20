"""DynamoDB persistence for users.

Credentials are never read or handled directly by this module — see
`app/services/s3_client.py` for the same convention. boto3 resolves AWS
credentials via its default chain.

Table: `obligra-users`, PK `user_id` (UUID), with a GSI `email-index`
(partition key `email`) used to look up a user by email at signup
(duplicate check) and login, without a full table scan.

`password_hash` is stored here but this module never returns it to
callers as part of a "safe" user dict — `get_user_public` strips it
explicitly. Callers that need to verify a password (login) use
`get_user_by_email_with_hash`, which is only ever called from the login
endpoint itself, immediately followed by a hash comparison.
"""

import uuid
from datetime import UTC, datetime
from functools import lru_cache

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import BotoCoreError, ClientError

from app.config import get_settings

_EMAIL_INDEX = "email-index"


class DynamoDBError(RuntimeError):
    """Raised when a DynamoDB read or write fails."""


class DuplicateEmailError(RuntimeError):
    """Raised when attempting to create a user with an email that's already registered."""


@lru_cache
def _get_resource():
    settings = get_settings()
    return boto3.resource("dynamodb", region_name=settings.aws_region)


def _users_table():
    settings = get_settings()
    return _get_resource().Table(settings.dynamodb_users_table)


def get_user_by_email_raw(email: str) -> dict | None:
    """Return the raw user item (including `password_hash`) by email, or None.

    Internal use only — callers outside this module should use
    `get_user_by_email` (which strips the hash) unless they specifically
    need to verify a password (login flow).
    """
    try:
        response = _users_table().query(
            IndexName=_EMAIL_INDEX,
            KeyConditionExpression=Key("email").eq(email),
            Limit=1,
        )
    except (BotoCoreError, ClientError) as exc:
        raise DynamoDBError(f"Failed to look up user by email: {exc}") from exc

    items = response.get("Items", [])
    return items[0] if items else None


def _strip_hash(item: dict) -> dict:
    return {key: value for key, value in item.items() if key != "password_hash"}


def create_user(name: str, email: str, password_hash: str) -> dict:
    """Create a new user. Returns the created user WITHOUT `password_hash`.

    Raises:
        DuplicateEmailError: if a user with this email already exists.
        DynamoDBError: on any other storage failure.
    """
    normalized_email = email.strip().lower()

    existing = get_user_by_email_raw(normalized_email)
    if existing is not None:
        raise DuplicateEmailError(f"An account with email '{normalized_email}' already exists.")

    user_id = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()
    item = {
        "user_id": user_id,
        "name": name,
        "email": normalized_email,
        "password_hash": password_hash,
        "created_at": now,
    }

    try:
        # Belt-and-suspenders against a race between the email-uniqueness
        # check above and this write: also assert no item with this
        # user_id already exists (it's a fresh UUID, so this only ever
        # protects against an extraordinarily unlikely UUID collision,
        # but it's free and correct to include).
        _users_table().put_item(Item=item, ConditionExpression="attribute_not_exists(user_id)")
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            raise DynamoDBError("Failed to create user: generated ID collision, please retry.") from exc
        raise DynamoDBError(f"Failed to create user: {exc}") from exc
    except BotoCoreError as exc:
        raise DynamoDBError(f"Failed to create user: {exc}") from exc

    return _strip_hash(item)


def get_user_by_email(email: str) -> dict | None:
    """Return a user by email, without `password_hash`, or None if not found."""
    item = get_user_by_email_raw(email.strip().lower())
    return _strip_hash(item) if item is not None else None


def get_user_by_id(user_id: str) -> dict | None:
    """Return a user by ID, without `password_hash`, or None if not found."""
    try:
        response = _users_table().get_item(Key={"user_id": user_id})
    except (BotoCoreError, ClientError) as exc:
        raise DynamoDBError(f"Failed to fetch user: {exc}") from exc

    item = response.get("Item")
    return _strip_hash(item) if item is not None else None
