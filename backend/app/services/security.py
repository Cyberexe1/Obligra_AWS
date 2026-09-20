"""Password hashing (bcrypt) and JWT access token creation/verification.

Passwords are never stored or transmitted in plaintext beyond the initial
request body — this module hashes them immediately with bcrypt (which
includes a per-password random salt) and only ever compares hashes.

JWTs are signed with HS256 using `settings.jwt_secret_key` (see
`app/config.py` — the app refuses to start without this secret set).
Tokens carry the user's ID as the `sub` claim plus an expiry (`exp`); no
other user data is embedded, so a token alone never leaks anything about
the user beyond their ID.
"""

from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.config import get_settings

# bcrypt's underlying algorithm has a hard 72-byte input limit; passing a
# longer password raises ValueError instead of truncating. The signup
# schema already caps password length at 72 characters, but this module
# enforces the byte limit independently so it can't silently break if
# that constraint is ever loosened elsewhere.
_MAX_PASSWORD_BYTES = 72


class InvalidTokenError(Exception):
    """Raised when a JWT is missing, malformed, expired, or has an invalid signature."""


def hash_password(plain_password: str) -> str:
    """Hash a plaintext password with bcrypt. Returns a UTF-8 string suitable for storage."""
    password_bytes = plain_password.encode("utf-8")
    if len(password_bytes) > _MAX_PASSWORD_BYTES:
        raise ValueError(f"Password must be at most {_MAX_PASSWORD_BYTES} bytes when UTF-8 encoded.")

    hashed = bcrypt.hashpw(password_bytes, bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Check a plaintext password against a stored bcrypt hash."""
    password_bytes = plain_password.encode("utf-8")
    if len(password_bytes) > _MAX_PASSWORD_BYTES:
        # A too-long candidate password can never match a hash of a
        # <=72-byte password; treat it as a normal non-match rather than
        # raising, so login failures look like any other wrong password.
        return False

    try:
        return bcrypt.checkpw(password_bytes, password_hash.encode("utf-8"))
    except ValueError:
        # Malformed/corrupt stored hash — fail closed.
        return False


def create_access_token(user_id: str) -> tuple[str, int]:
    """Create a signed JWT access token for the given user ID.

    Returns `(token, expires_in_minutes)`.
    """
    settings = get_settings()
    now = datetime.now(UTC)
    expire_minutes = settings.access_token_expire_minutes
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + timedelta(minutes=expire_minutes),
    }
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, expire_minutes


def decode_access_token(token: str) -> str:
    """Decode and verify a JWT access token, returning the user ID (`sub` claim).

    Raises:
        InvalidTokenError: if the token is missing, malformed, expired,
            or fails signature verification.
    """
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError as exc:
        raise InvalidTokenError("Token has expired.") from exc
    except jwt.InvalidTokenError as exc:
        raise InvalidTokenError("Token is invalid.") from exc

    user_id = payload.get("sub")
    if not user_id or not isinstance(user_id, str):
        raise InvalidTokenError("Token is missing a valid subject claim.")

    return user_id
