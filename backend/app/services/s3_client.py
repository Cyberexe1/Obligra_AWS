"""S3 client helper.

Credentials are never read or handled directly by this module. boto3 uses
its default credential resolution chain: environment variables
(`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN`),
shared credentials/config files, or an attached IAM role. This keeps
secrets out of application code entirely.
"""

from functools import lru_cache
from typing import BinaryIO

import boto3
from botocore.client import BaseClient
from botocore.exceptions import BotoCoreError, ClientError

from app.config import get_settings


class S3UploadError(RuntimeError):
    """Raised when an object cannot be uploaded to S3."""


@lru_cache
def get_s3_client() -> BaseClient:
    """Return a cached boto3 S3 client configured for the app's region."""
    settings = get_settings()
    return boto3.client("s3", region_name=settings.aws_region)


def upload_fileobj(
    file_obj: BinaryIO,
    object_key: str,
    content_type: str,
) -> None:
    """Upload a file-like object to the configured S3 bucket.

    Raises:
        S3UploadError: if the upload fails for any reason (missing
            credentials, network error, access denied, etc).
    """
    settings = get_settings()
    client = get_s3_client()

    try:
        client.upload_fileobj(
            file_obj,
            settings.s3_bucket_name,
            object_key,
            ExtraArgs={"ContentType": content_type},
        )
    except (BotoCoreError, ClientError) as exc:
        raise S3UploadError(f"Failed to upload object to S3: {exc}") from exc
