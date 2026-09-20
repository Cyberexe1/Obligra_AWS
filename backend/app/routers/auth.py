"""Authentication endpoints: signup, login, and current-user lookup.

Passwords are hashed with bcrypt before storage (`app/services/security.py`)
and never returned by any endpoint. Successful signup/login issues a
signed JWT access token; protected endpoints elsewhere in the app depend
on `app/dependencies/auth.get_current_user` to validate that token.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies.auth import get_current_user
from app.schemas.auth import LoginRequest, SignupRequest, TokenResponse, UserResponse
from app.services.security import create_access_token, hash_password, verify_password
from app.services.user_store import DuplicateEmailError, DynamoDBError, create_user, get_user_by_email_raw

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(body: SignupRequest) -> TokenResponse:
    """Create a new user account and return an access token for it.

    Rejects signup with 409 if the email is already registered.
    """
    try:
        password_hash = hash_password(body.password)
    except ValueError as exc:
        # Should not normally happen — the schema already caps password
        # length — but fail clearly rather than with a raw bcrypt error
        # if it ever does (e.g. the constraint is loosened later).
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    try:
        user = create_user(name=body.name, email=body.email, password_hash=password_hash)
    except DuplicateEmailError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except DynamoDBError as exc:
        logger.exception("Failed to create user during signup")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to create the account. Please try again.",
        ) from exc

    token, expires_in = create_access_token(user["user_id"])

    return TokenResponse(
        access_token=token,
        expires_in_minutes=expires_in,
        user=UserResponse(**user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest) -> TokenResponse:
    """Authenticate with email + password and return an access token.

    Returns 401 for any combination of unknown email or wrong password —
    the error message is identical either way, so a caller cannot use
    this endpoint to enumerate which emails are registered.
    """
    try:
        raw_user = get_user_by_email_raw(body.email)
    except DynamoDBError as exc:
        logger.exception("Failed to look up user during login")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to process login. Please try again.",
        ) from exc

    invalid_credentials = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect email or password.",
    )

    if raw_user is None:
        raise invalid_credentials

    if not verify_password(body.password, raw_user["password_hash"]):
        raise invalid_credentials

    token, expires_in = create_access_token(raw_user["user_id"])
    user = {key: value for key, value in raw_user.items() if key != "password_hash"}

    return TokenResponse(
        access_token=token,
        expires_in_minutes=expires_in,
        user=UserResponse(**user),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)) -> UserResponse:
    """Return the profile of the currently authenticated user."""
    return UserResponse(**current_user)
