"""Pydantic schemas for authentication (signup, login, current-user lookup)."""

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class SignupRequest(BaseModel):
    """Request body for POST /api/auth/signup."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(
        min_length=8,
        max_length=72,
        description="Plaintext password; never persisted as-is. Capped at 72 characters — bcrypt's hard limit is 72 bytes, and this bound keeps any UTF-8 password safely under that.",
    )


class LoginRequest(BaseModel):
    """Request body for POST /api/auth/login."""

    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class UserResponse(BaseModel):
    """A user as returned by the API. Never includes `password_hash`."""

    user_id: str
    name: str
    email: str
    created_at: str


class TokenResponse(BaseModel):
    """Response returned after a successful signup or login."""

    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    user: UserResponse
