"""FastAPI dependency for authenticating requests via a JWT bearer token.

`get_current_user` is the single choke point every protected endpoint
depends on: it extracts the `Authorization: Bearer <token>` header,
validates the JWT (signature + expiry), loads the corresponding user
from DynamoDB, and returns it. Missing, malformed, expired, or otherwise
invalid tokens all result in a 401 response — the specific reason is
included in the response body but the status code is always 401, which
is the correct signal for "you are not authenticated" as opposed to 403
("you are authenticated but not allowed").
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.services.security import InvalidTokenError, decode_access_token
from app.services.user_store import DynamoDBError, get_user_by_id

_bearer_scheme = HTTPBearer(
    scheme_name="BearerAuth",
    description="JWT access token obtained from POST /api/auth/login or /api/auth/signup.",
    auto_error=False,
)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> dict:
    """Resolve the authenticated user for the current request.

    Raises:
        HTTPException(401): if the Authorization header is missing, the
            token is malformed/invalid/expired, or the token's subject
            does not correspond to an existing user.
    """
    if credentials is None or not credentials.credentials:
        raise _unauthorized("Missing authentication token.")

    try:
        user_id = decode_access_token(credentials.credentials)
    except InvalidTokenError as exc:
        raise _unauthorized(str(exc)) from exc

    try:
        user = get_user_by_id(user_id)
    except DynamoDBError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to look up the authenticated user.",
        ) from exc

    if user is None:
        raise _unauthorized("The user for this token no longer exists.")

    return user


async def get_current_user_id(user: dict = Depends(get_current_user)) -> str:
    """Convenience dependency for endpoints that only need the user's ID."""
    return user["user_id"]
