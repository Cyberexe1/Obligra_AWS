"""Amazon Textract integration for document text extraction.

Credentials are never read or handled directly by this module — see
`app/services/s3_client.py` for the same convention. boto3 resolves AWS
credentials via its default chain (environment variables, shared config,
or an attached IAM role).

The async job API (`start_document_text_detection` /
`get_document_text_detection`) is used uniformly for PDFs and images so
both single-page and multi-page PDFs are supported without a special
case. For this stage of the project, job completion is awaited by polling
inside the request handler; a production version would use an SNS/SQS
completion notification instead of polling.
"""

import asyncio
import time
from functools import lru_cache

import boto3
from botocore.client import BaseClient
from botocore.exceptions import BotoCoreError, ClientError

from app.config import get_settings


class TextractError(RuntimeError):
    """Raised when Textract text extraction fails."""


@lru_cache
def get_textract_client() -> BaseClient:
    """Return a cached boto3 Textract client configured for the app's region."""
    settings = get_settings()
    return boto3.client("textract", region_name=settings.aws_region)


def _start_job(bucket: str, key: str) -> str:
    client = get_textract_client()
    try:
        response = client.start_document_text_detection(
            DocumentLocation={"S3Object": {"Bucket": bucket, "Name": key}},
        )
    except (BotoCoreError, ClientError) as exc:
        raise TextractError(f"Failed to start Textract job: {exc}") from exc
    return response["JobId"]


def _get_job_status(job_id: str) -> dict:
    client = get_textract_client()
    try:
        return client.get_document_text_detection(JobId=job_id)
    except (BotoCoreError, ClientError) as exc:
        raise TextractError(f"Failed to fetch Textract job status: {exc}") from exc


def _collect_all_pages(job_id: str, first_response: dict) -> list[dict]:
    """Fetch every page of Textract results for a completed job."""
    client = get_textract_client()
    blocks = list(first_response.get("Blocks", []))
    next_token = first_response.get("NextToken")

    while next_token:
        try:
            response = client.get_document_text_detection(JobId=job_id, NextToken=next_token)
        except (BotoCoreError, ClientError) as exc:
            raise TextractError(f"Failed to fetch Textract job results: {exc}") from exc
        blocks.extend(response.get("Blocks", []))
        next_token = response.get("NextToken")

    return blocks


def _blocks_to_text(blocks: list[dict]) -> str:
    lines = [block["Text"] for block in blocks if block.get("BlockType") == "LINE" and "Text" in block]
    return "\n".join(lines)


async def extract_text(bucket: str, key: str) -> str:
    """Run Textract text detection on an S3 object and return the extracted text.

    Raises:
        TextractError: if the job fails to start, fails during processing,
            or does not complete within the configured timeout.
    """
    settings = get_settings()
    job_id = await asyncio.to_thread(_start_job, bucket, key)

    deadline = time.monotonic() + settings.textract_poll_timeout_seconds
    response = await asyncio.to_thread(_get_job_status, job_id)

    while response.get("JobStatus") == "IN_PROGRESS":
        if time.monotonic() >= deadline:
            raise TextractError(
                f"Textract job {job_id} did not complete within "
                f"{settings.textract_poll_timeout_seconds} seconds."
            )
        await asyncio.sleep(settings.textract_poll_interval_seconds)
        response = await asyncio.to_thread(_get_job_status, job_id)

    job_status = response.get("JobStatus")
    if job_status != "SUCCEEDED":
        status_message = response.get("StatusMessage", "No further details provided.")
        raise TextractError(f"Textract job {job_id} ended with status '{job_status}': {status_message}")

    blocks = await asyncio.to_thread(_collect_all_pages, job_id, response)
    return _blocks_to_text(blocks)
