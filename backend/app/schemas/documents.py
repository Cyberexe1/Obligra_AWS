"""Pydantic schemas for document upload, text extraction, and obligation extraction."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DocumentUploadResponse(BaseModel):
    """Response returned after a successful document upload.

    `status` is `"processing"` immediately after upload — text extraction
    runs in the background and its result is retrieved via
    `GET /api/documents/{document_id}/text`.
    """

    document_id: str
    filename: str
    s3_key: str
    status: str


class DocumentSummary(BaseModel):
    """A single document's summary, as returned by GET /api/documents."""

    document_id: str
    filename: str
    status: str
    obligations_status: str | None = None
    created_at: str


class DocumentListResponse(BaseModel):
    """Response returned by GET /api/documents."""

    documents: list[DocumentSummary]
    count: int


class DocumentTextResponse(BaseModel):
    """Response returned when fetching a document's extracted text."""

    document_id: str
    filename: str
    extracted_text: str | None
    status: str
    error: str | None = None


class Obligation(BaseModel):
    """A single actionable obligation identified in a document.

    Every field except `confidence` is `None` when the source document
    does not state it — the model is instructed never to invent values,
    and this schema enforces that any field can legitimately be absent.
    """

    model_config = ConfigDict(extra="forbid")

    action: str | None = Field(default=None, description="The action or duty that must be performed.")
    deadline: str | None = Field(default=None, description="The due date or time constraint, verbatim if possible.")
    condition: str | None = Field(default=None, description="Any condition that triggers or qualifies the obligation.")
    source: str | None = Field(
        default=None, description="The verbatim excerpt from the extracted text this obligation is based on."
    )
    consequence: str | None = Field(default=None, description="The stated consequence of non-compliance, if any.")
    confidence: float = Field(ge=0.0, le=1.0, description="Model's confidence that this is a genuine obligation.")


class ObligationExtractionResponse(BaseModel):
    """Response returned after running obligation extraction on a document."""

    document_id: str
    filename: str
    status: str
    obligations: list[Obligation] | None = None
    error: str | None = None


ObligationStatus = Literal["pending", "in_progress", "completed", "blocked"]


class StoredObligation(BaseModel):
    """An obligation as persisted in DynamoDB and returned by the obligations API.

    `source_id` is the primary reference to this obligation's origin —
    every obligation is extracted from exactly one source (file, pasted
    text, email, etc; see `app/schemas/sources.py`). `document_id` is kept
    for backward compatibility with the original file-upload-only flow
    and is populated whenever the source is a file upload, but new source
    types (text, email, ...) have no document at all, so it is optional.
    """

    obligation_id: str
    source_id: str | None = None
    document_id: str | None = None
    action: str | None
    deadline: str | None
    condition: str | None
    source: str | None
    consequence: str | None
    confidence: float
    status: ObligationStatus
    created_at: str


class ObligationListResponse(BaseModel):
    """Response returned by GET /api/obligations."""

    obligations: list[StoredObligation]
    count: int


class ObligationStatusUpdateRequest(BaseModel):
    """Request body for PATCH /api/obligations/{obligation_id}/status."""

    model_config = ConfigDict(extra="forbid")

    status: ObligationStatus


RelationshipType = Literal["depends_on", "blocks", "follows", "conditional_on"]


class DetectedRelationship(BaseModel):
    """A single dependency relationship as proposed by the model, pre-persistence.

    `from_obligation_id` and `to_obligation_id` must reference obligations
    that were actually provided in the analysis request — this is
    re-validated in code, not just requested of the model.
    """

    model_config = ConfigDict(extra="forbid")

    from_obligation_id: str
    to_obligation_id: str
    relationship_type: RelationshipType
    reason: str = Field(description="A concrete, content-grounded explanation of why this relationship holds.")
    confidence: float = Field(ge=0.0, le=1.0)


class StoredRelationship(DetectedRelationship):
    """A relationship as persisted in DynamoDB."""

    relationship_id: str
    created_at: str


class AnalyzeDependenciesRequest(BaseModel):
    """Optional request body for POST /api/obligations/analyze-dependencies."""

    model_config = ConfigDict(extra="forbid")

    document_id: str | None = Field(
        default=None, description="If set, only analyze obligations belonging to this document."
    )
    source_id: str | None = Field(
        default=None, description="If set, only analyze obligations belonging to this source."
    )


class AnalyzeDependenciesResponse(BaseModel):
    """Response returned after running dependency analysis."""

    relationships: list[StoredRelationship]
    count: int
    obligations_analyzed: int
    cycles_detected: list[list[str]] = Field(
        default_factory=list,
        description="Each entry is a list of obligation_ids forming a cycle, if any were found.",
    )


class GraphNode(BaseModel):
    """A single obligation rendered as a graph node."""

    id: str
    label: str | None
    status: ObligationStatus
    deadline: str | None
    confidence: float


class GraphEdge(BaseModel):
    """A single relationship rendered as a graph edge, in a React Flow-friendly shape."""

    id: str
    source: str
    target: str
    type: RelationshipType
    label: str
    reason: str
    confidence: float


class ObligationGraphResponse(BaseModel):
    """Response returned by GET /api/obligations/graph."""

    nodes: list[GraphNode]
    edges: list[GraphEdge]
    cycles_detected: list[list[str]] = Field(default_factory=list)


RiskLevel = Literal["low", "medium", "high", "critical"]


class ObligationRisk(BaseModel):
    """A single obligation's rule-based risk assessment.

    `reason` is a plain-language explanation built directly from the
    specific rules that fired (overdue, blocking count, chain risk,
    etc) — never from an LLM judgment call.
    """

    obligation_id: str
    action: str | None
    risk_level: RiskLevel
    reason: str
    blocked_count: int
    days_remaining: int | None = Field(
        default=None, description="Days until the parsed deadline; negative if overdue. Null if the deadline text could not be resolved to an absolute date."
    )


class RisksResponse(BaseModel):
    """Response returned by GET /api/obligations/risks."""

    risks: list[ObligationRisk]
    count: int


class PriorityItem(BaseModel):
    """A single obligation ranked for action, with the risk data behind the ranking."""

    obligation_id: str
    action: str | None
    risk_level: RiskLevel
    reason: str
    blocked_count: int
    days_remaining: int | None = None
    priority_score: float = Field(description="Higher means more urgent. Derived transparently from risk level, deadline proximity, and blocked_count.")


class PrioritiesResponse(BaseModel):
    """Response returned by GET /api/obligations/priorities."""

    priorities: list[PriorityItem]
    count: int
