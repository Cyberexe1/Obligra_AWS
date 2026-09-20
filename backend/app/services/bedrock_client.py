"""Amazon Bedrock integration for AI obligation extraction.

Credentials are never read or handled directly by this module — see
`app/services/s3_client.py` for the same convention. boto3 resolves AWS
credentials via its default chain (environment variables, shared config,
or an attached IAM role).

This module only extracts obligations from already-extracted document
text (produced by the Textract pipeline). It does not implement
dependency graphs, risk analysis, or notifications.
"""

import json
import logging
from functools import lru_cache

import boto3
from botocore.client import BaseClient
from botocore.exceptions import BotoCoreError, ClientError
from pydantic import ValidationError

from app.config import get_settings
from app.schemas.documents import Obligation

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are a precise document analysis assistant for OBLIGRA, a system that \
identifies actionable obligations in documents such as contracts, notices, and letters.

Your task: read the provided document text and identify every actionable obligation \
stated in it. An obligation is a duty, requirement, or action that a party must (or must \
not) perform.

STRICT RULES — follow these exactly:
1. Respond with ONLY a JSON array. No prose, no explanation, no markdown code fences.
2. Each element of the array is a JSON object with exactly these fields:
   - "action": the action or duty required, as a short phrase (string or null)
   - "deadline": the due date/time constraint, quoted as close to verbatim as possible (string or null)
   - "condition": any condition that triggers or qualifies the obligation (string or null)
   - "source": the verbatim excerpt from the document text that this obligation is based on (string or null)
   - "consequence": the stated consequence of non-compliance, if the document mentions one (string or null)
   - "confidence": your confidence that this is a genuine, correctly-extracted obligation, from 0.0 to 1.0 (number)
3. NEVER invent, guess, or infer a value for any field that is not explicitly stated in the \
document text. If the document does not state a deadline, condition, source, or consequence, \
use JSON null for that field instead of making one up.
4. The "source" field must be a real excerpt copied from the provided text, not a paraphrase.
5. If the document contains no actionable obligations, respond with an empty JSON array: []
6. Do not include any obligation you are not reasonably confident is actually present in the text.

Respond with the JSON array now."""


class BedrockError(RuntimeError):
    """Raised when obligation extraction via Bedrock fails."""


@lru_cache
def get_bedrock_client() -> BaseClient:
    """Return a cached boto3 Bedrock runtime client configured for the app's region."""
    settings = get_settings()
    return boto3.client("bedrock-runtime", region_name=settings.aws_region)


def _extract_json_array(raw_text: str) -> str:
    """Pull a JSON array out of a model response that may include stray text or code fences."""
    text = raw_text.strip()

    # Strip common markdown code-fence wrapping, if present.
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()

    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1 or end < start:
        raise BedrockError("Model response did not contain a JSON array.")

    return text[start : end + 1]


def _invoke_model(document_text: str) -> str:
    settings = get_settings()
    client = get_bedrock_client()

    try:
        response = client.converse(
            modelId=settings.bedrock_model_id,
            system=[{"text": _SYSTEM_PROMPT}],
            messages=[
                {
                    "role": "user",
                    "content": [{"text": f"Document text:\n\n{document_text}"}],
                }
            ],
            inferenceConfig={
                "maxTokens": settings.bedrock_max_tokens,
                "temperature": settings.bedrock_temperature,
            },
        )
    except (BotoCoreError, ClientError) as exc:
        raise BedrockError(f"Failed to invoke Bedrock model: {exc}") from exc

    try:
        content_blocks = response["output"]["message"]["content"]
        text = "".join(block.get("text", "") for block in content_blocks)
    except (KeyError, IndexError, TypeError) as exc:
        raise BedrockError(f"Unexpected response shape from Bedrock: {exc}") from exc

    if not text.strip():
        raise BedrockError("Bedrock returned an empty response.")

    return text


def extract_obligations(document_text: str) -> list[Obligation]:
    """Send extracted document text to Bedrock and return validated obligations.

    Raises:
        BedrockError: if the model cannot be invoked, or if its response
            cannot be parsed into the expected JSON structure after
            validation.
    """
    if not document_text or not document_text.strip():
        return []

    raw_response = _invoke_model(document_text)
    json_array_text = _extract_json_array(raw_response)

    try:
        parsed = json.loads(json_array_text)
    except json.JSONDecodeError as exc:
        logger.warning("Bedrock response was not valid JSON: %s", raw_response[:500])
        raise BedrockError(f"Model response was not valid JSON: {exc}") from exc

    if not isinstance(parsed, list):
        raise BedrockError("Model response JSON was not an array.")

    obligations: list[Obligation] = []
    for index, item in enumerate(parsed):
        try:
            obligations.append(Obligation.model_validate(item))
        except ValidationError as exc:
            logger.warning("Skipping malformed obligation at index %d: %s", index, exc)
            continue

    return obligations
