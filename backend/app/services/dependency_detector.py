"""Amazon Bedrock integration for obligation dependency detection.

Credentials are never read or handled directly by this module — see
`app/services/s3_client.py` for the same convention.

Given a set of already-extracted, already-persisted obligations, this
module asks Bedrock to identify genuine logical dependencies between them
(depends_on, blocks, follows, conditional_on) based on their action,
condition, consequence, and deadline fields. It explicitly does not
implement risk scoring, notifications, or a UI — only detection and
validation of the relationships themselves.
"""

import json
import logging
from functools import lru_cache

import boto3
from botocore.client import BaseClient
from botocore.exceptions import BotoCoreError, ClientError
from pydantic import ValidationError

from app.config import get_settings
from app.schemas.documents import DetectedRelationship, StoredObligation

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are a precise reasoning assistant for OBLIGRA, a system that tracks \
obligations extracted from documents and the logical dependencies between them.

You will be given a numbered list of obligations, each with an ID and its action, deadline, \
condition, consequence, and source excerpt. Your task: identify genuine LOGICAL dependency \
relationships between pairs of obligations.

Relationship types:
- "depends_on": obligation A cannot be completed until obligation B is completed (B must \
happen first, as a real-world prerequisite).
- "blocks": obligation A prevents or delays obligation B from being completed until A is done.
- "follows": obligation A logically or temporally happens after obligation B, as a sequence \
step, without A being strictly blocked by B (e.g. a routine next stage).
- "conditional_on": obligation A only applies if a condition described in obligation B is met \
(A's applicability is conditioned on B, not just their timing).

CRITICAL RULES — follow these exactly:
1. A relationship must be a MEANINGFUL LOGICAL connection grounded in what the obligations \
actually require, reference, or produce. Do NOT create a relationship just because two \
obligations use similar words, mention the same party, or come from the same document.
2. Only propose a relationship if you can point to a concrete logical link: for example, one \
obligation's action produces something (a document, approval, payment, certificate) that \
another obligation's action, condition, or consequence explicitly requires or references.
3. If you are not confident a relationship is real, do not include it. It is correct and \
expected to return zero relationships for obligations that have no genuine dependency.
4. Never propose a relationship between an obligation and itself.
5. Respond with ONLY a JSON array. No prose, no explanation, no markdown code fences.
6. Each element of the array is a JSON object with exactly these fields:
   - "from_obligation_id": the ID of the obligation that is the source of the relationship
   - "to_obligation_id": the ID of the obligation that is the target of the relationship
   - "relationship_type": one of "depends_on", "blocks", "follows", "conditional_on"
   - "reason": a concrete, specific explanation (1-2 sentences) citing what in the obligations' \
own text justifies this relationship. Do not justify a relationship by wording similarity alone.
   - "confidence": your confidence that this is a genuine relationship, from 0.0 to 1.0

For "depends_on", orient the relationship as: the obligation that must happen LATER has \
`from_obligation_id`, and the prerequisite obligation that must happen FIRST has \
`to_obligation_id`. For example, if "Submit Application" depends on "Obtain Income \
Certificate", then from_obligation_id is the ID for "Submit Application" and \
to_obligation_id is the ID for "Obtain Income Certificate".

Only use obligation IDs that appear in the provided list. Respond with the JSON array now."""


class DependencyDetectionError(RuntimeError):
    """Raised when dependency detection via Bedrock fails."""


@lru_cache
def _get_bedrock_client() -> BaseClient:
    settings = get_settings()
    return boto3.client("bedrock-runtime", region_name=settings.aws_region)


def _format_obligations_for_prompt(obligations: list[StoredObligation]) -> str:
    lines = []
    for obligation in obligations:
        lines.append(
            f"- id: {obligation.obligation_id}\n"
            f"  action: {obligation.action!r}\n"
            f"  deadline: {obligation.deadline!r}\n"
            f"  condition: {obligation.condition!r}\n"
            f"  consequence: {obligation.consequence!r}\n"
            f"  source: {obligation.source!r}"
        )
    return "\n".join(lines)


def _extract_json_array(raw_text: str) -> str:
    """Pull a JSON array out of a model response that may include stray text or code fences."""
    text = raw_text.strip()

    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()

    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1 or end < start:
        raise DependencyDetectionError("Model response did not contain a JSON array.")

    return text[start : end + 1]


def _invoke_model(obligations: list[StoredObligation]) -> str:
    settings = get_settings()
    client = _get_bedrock_client()
    prompt_body = _format_obligations_for_prompt(obligations)

    try:
        response = client.converse(
            modelId=settings.bedrock_model_id,
            system=[{"text": _SYSTEM_PROMPT}],
            messages=[{"role": "user", "content": [{"text": f"Obligations:\n\n{prompt_body}"}]}],
            inferenceConfig={
                "maxTokens": settings.bedrock_max_tokens,
                "temperature": settings.bedrock_temperature,
            },
        )
    except (BotoCoreError, ClientError) as exc:
        raise DependencyDetectionError(f"Failed to invoke Bedrock model: {exc}") from exc

    try:
        content_blocks = response["output"]["message"]["content"]
        text = "".join(block.get("text", "") for block in content_blocks)
    except (KeyError, IndexError, TypeError) as exc:
        raise DependencyDetectionError(f"Unexpected response shape from Bedrock: {exc}") from exc

    if not text.strip():
        raise DependencyDetectionError("Bedrock returned an empty response.")

    return text


def detect_dependencies(obligations: list[StoredObligation]) -> list[DetectedRelationship]:
    """Analyze a set of obligations and return validated dependency relationships.

    Every returned relationship references obligation IDs that were
    actually present in the input `obligations` list — any relationship
    the model proposes involving an unknown ID, or a self-reference, is
    dropped rather than trusted.

    Raises:
        DependencyDetectionError: if the model cannot be invoked or its
            response cannot be parsed as the expected JSON structure.
    """
    if len(obligations) < 2:
        return []

    known_ids = {obligation.obligation_id for obligation in obligations}

    raw_response = _invoke_model(obligations)
    json_array_text = _extract_json_array(raw_response)

    try:
        parsed = json.loads(json_array_text)
    except json.JSONDecodeError as exc:
        logger.warning("Bedrock response was not valid JSON: %s", raw_response[:500])
        raise DependencyDetectionError(f"Model response was not valid JSON: {exc}") from exc

    if not isinstance(parsed, list):
        raise DependencyDetectionError("Model response JSON was not an array.")

    relationships: list[DetectedRelationship] = []
    for index, item in enumerate(parsed):
        try:
            relationship = DetectedRelationship.model_validate(item)
        except ValidationError as exc:
            logger.warning("Skipping malformed relationship at index %d: %s", index, exc)
            continue

        if relationship.from_obligation_id not in known_ids or relationship.to_obligation_id not in known_ids:
            logger.warning(
                "Skipping relationship referencing unknown obligation ID(s): %s -> %s",
                relationship.from_obligation_id,
                relationship.to_obligation_id,
            )
            continue

        if relationship.from_obligation_id == relationship.to_obligation_id:
            logger.warning("Skipping self-referencing relationship for obligation %s", relationship.from_obligation_id)
            continue

        relationships.append(relationship)

    return relationships
