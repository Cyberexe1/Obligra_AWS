"""Obligation query, status-management, dependency-detection, and risk endpoints.

Obligations and their relationships are read from and written to
DynamoDB via `app/services/dynamodb_client.py`. Dependency detection uses
Bedrock (see `app/services/dependency_detector.py`) to identify logical
relationships between already-extracted obligations. Risk levels are
computed by explicit rules (see `app/services/risk_analysis.py`) — an
LLM is never involved in assigning the final risk level.

Every endpoint here requires authentication via
`app/dependencies/auth.get_current_user`, and every query is scoped to
the requesting user's own obligations (and, for relationships, to
relationships between two of that user's own obligations) — no endpoint
in this module can return or modify another user's data.
"""

import logging

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status

from app.dependencies.auth import get_current_user
from app.schemas.documents import (
    AnalyzeDependenciesRequest,
    AnalyzeDependenciesResponse,
    GraphEdge,
    GraphNode,
    ObligationGraphResponse,
    ObligationListResponse,
    ObligationStatusUpdateRequest,
    PriorityItem,
    PrioritiesResponse,
    RisksResponse,
    StoredObligation,
)
from app.services.dependency_detector import DependencyDetectionError, detect_dependencies
from app.services.dynamodb_client import (
    DynamoDBError,
    clear_relationships,
    get_obligation_raw,
    list_obligations,
    list_relationships,
    save_relationships,
    update_obligation_status,
)
from app.services.graph_utils import detect_cycles
from app.services.risk_analysis import analyze_risks, compute_priority_score

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/obligations", tags=["obligations"])

_RELATIONSHIP_LABELS = {
    "depends_on": "depends on",
    "blocks": "blocks",
    "follows": "follows",
    "conditional_on": "conditional on",
}


@router.get("", response_model=ObligationListResponse)
async def list_all_obligations(
    document_id: str | None = Query(default=None, description="Filter obligations by document ID."),
    source_id: str | None = Query(default=None, description="Filter obligations by source ID."),
    current_user: dict = Depends(get_current_user),
) -> ObligationListResponse:
    """List the current user's obligations, optionally filtered by `document_id` and/or `source_id`."""
    try:
        obligations = list_obligations(current_user["user_id"], document_id=document_id, source_id=source_id)
    except DynamoDBError as exc:
        logger.exception("Failed to list obligations")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to fetch obligations from storage.",
        ) from exc

    return ObligationListResponse(obligations=obligations, count=len(obligations))


@router.post("/analyze-dependencies", response_model=AnalyzeDependenciesResponse)
async def analyze_dependencies(
    body: AnalyzeDependenciesRequest = Body(default=AnalyzeDependenciesRequest()),
    current_user: dict = Depends(get_current_user),
) -> AnalyzeDependenciesResponse:
    """Analyze the current user's obligations and detect logical dependency relationships.

    Relationships are re-detected from scratch each time this is called:
    any previously stored relationships between two of this user's own
    obligations are cleared and replaced with the newly detected set, so
    re-running analysis after obligations change doesn't accumulate stale
    or duplicate edges. This never touches another user's relationships.

    If `document_id` and/or `source_id` is provided, only obligations
    belonging to that document/source (and to the current user) are
    analyzed. Otherwise all of the current user's obligations are
    analyzed together, which allows detecting dependencies across that
    user's documents and other sources.
    """
    try:
        obligations = list_obligations(
            current_user["user_id"], document_id=body.document_id, source_id=body.source_id
        )
    except DynamoDBError as exc:
        logger.exception("Failed to fetch obligations for dependency analysis")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to fetch obligations from storage.",
        ) from exc

    if len(obligations) < 2:
        return AnalyzeDependenciesResponse(
            relationships=[],
            count=0,
            obligations_analyzed=len(obligations),
            cycles_detected=[],
        )

    try:
        detected = detect_dependencies(obligations)
    except DependencyDetectionError as exc:
        logger.warning("Dependency detection failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to analyze dependencies: {exc}",
        ) from exc
    except Exception as exc:  # noqa: BLE001 - surface unexpected errors as a clean 500 instead of crashing
        logger.exception("Unexpected error during dependency analysis")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while analyzing dependencies.",
        ) from exc

    edges = [(r.from_obligation_id, r.to_obligation_id) for r in detected]
    cycles = detect_cycles(edges)
    if cycles:
        logger.warning("Detected %d cycle(s) in proposed dependency relationships: %s", len(cycles), cycles)

    owned_obligation_ids = {obligation.obligation_id for obligation in obligations}

    try:
        clear_relationships(owned_obligation_ids)
        stored = save_relationships(detected)
    except DynamoDBError as exc:
        logger.exception("Failed to persist detected relationships")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Relationships were detected but could not be saved. Please try again.",
        ) from exc

    return AnalyzeDependenciesResponse(
        relationships=stored,
        count=len(stored),
        obligations_analyzed=len(obligations),
        cycles_detected=cycles,
    )


@router.get("/graph", response_model=ObligationGraphResponse)
async def get_obligation_graph(current_user: dict = Depends(get_current_user)) -> ObligationGraphResponse:
    """Return the current user's obligations and their detected relationships as a graph.

    Shaped for direct consumption by a graph visualization library such
    as React Flow: `nodes` carry the fields needed to render an
    obligation, and `edges` carry `source`/`target` IDs plus relationship
    metadata. No layout/positioning is computed here — that's left to the
    consuming UI. Only the current user's own obligations and the
    relationships between them are included.
    """
    try:
        obligations = list_obligations(current_user["user_id"])
        owned_obligation_ids = {obligation.obligation_id for obligation in obligations}
        relationships = list_relationships(owned_obligation_ids)
    except DynamoDBError as exc:
        logger.exception("Failed to fetch graph data")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to fetch graph data from storage.",
        ) from exc

    nodes = [
        GraphNode(
            id=obligation.obligation_id,
            label=obligation.action,
            status=obligation.status,
            deadline=obligation.deadline,
            confidence=obligation.confidence,
        )
        for obligation in obligations
    ]

    # Stored relationships orient from/to as (dependent -> prerequisite),
    # e.g. "Submit Application" depends_on "Obtain Income Certificate"
    # is stored as from=Submit Application, to=Obtain Income Certificate.
    # The graph is rendered as a flow of completion order instead, so the
    # visual arrow points prerequisite -> dependent (source=to, target=from):
    # "Obtain Income Certificate" -> "Submit Application".
    edges = [
        GraphEdge(
            id=relationship.relationship_id,
            source=relationship.to_obligation_id,
            target=relationship.from_obligation_id,
            type=relationship.relationship_type,
            label=_RELATIONSHIP_LABELS[relationship.relationship_type],
            reason=relationship.reason,
            confidence=relationship.confidence,
        )
        for relationship in relationships
    ]

    cycles = detect_cycles([(edge.source, edge.target) for edge in edges])

    return ObligationGraphResponse(nodes=nodes, edges=edges, cycles_detected=cycles)


@router.get("/risks", response_model=RisksResponse)
async def get_obligation_risks(current_user: dict = Depends(get_current_user)) -> RisksResponse:
    """Return rule-based risk assessments for the current user's at-risk obligations.

    Risk levels (`low`, `medium`, `high`, `critical`) are computed by
    explicit, inspectable rules in `app/services/risk_analysis.py` — an
    LLM is never involved in assigning the final risk level. Detects:
    overdue obligations, obligations with an approaching deadline,
    obligations marked `blocked`, obligations blocking multiple
    downstream obligations, and obligations whose dependency chain
    includes an at-risk prerequisite. Obligations with none of these
    factors are omitted from the result. Scoped to the current user only.
    """
    try:
        obligations = list_obligations(current_user["user_id"])
        owned_obligation_ids = {obligation.obligation_id for obligation in obligations}
        relationships = list_relationships(owned_obligation_ids)
    except DynamoDBError as exc:
        logger.exception("Failed to fetch data for risk analysis")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to fetch obligations from storage.",
        ) from exc

    risks = analyze_risks(obligations, relationships)
    return RisksResponse(risks=risks, count=len(risks))


@router.get("/priorities", response_model=PrioritiesResponse)
async def get_obligation_priorities(
    limit: int = Query(default=10, ge=1, le=100, description="Maximum number of priority items to return."),
    current_user: dict = Depends(get_current_user),
) -> PrioritiesResponse:
    """Return the current user's obligations that should be addressed first.

    Ranked by a transparent priority score combining risk level, deadline
    urgency, and downstream blocking impact (see
    `app/services/risk_analysis.compute_priority_score` for the exact
    formula) — built directly from the same rule-based risk data returned
    by `GET /api/obligations/risks`, not a separate model judgment.
    Scoped to the current user only.
    """
    try:
        obligations = list_obligations(current_user["user_id"])
        owned_obligation_ids = {obligation.obligation_id for obligation in obligations}
        relationships = list_relationships(owned_obligation_ids)
    except DynamoDBError as exc:
        logger.exception("Failed to fetch data for priority ranking")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to fetch obligations from storage.",
        ) from exc

    risks = analyze_risks(obligations, relationships)

    priorities = [
        PriorityItem(
            obligation_id=risk.obligation_id,
            action=risk.action,
            risk_level=risk.risk_level,
            reason=risk.reason,
            blocked_count=risk.blocked_count,
            days_remaining=risk.days_remaining,
            priority_score=compute_priority_score(risk),
        )
        for risk in risks
    ]
    priorities.sort(key=lambda item: item.priority_score, reverse=True)
    top_priorities = priorities[:limit]

    return PrioritiesResponse(priorities=top_priorities, count=len(top_priorities))


@router.get("/{obligation_id}", response_model=StoredObligation)
async def get_single_obligation(
    obligation_id: str, current_user: dict = Depends(get_current_user)
) -> StoredObligation:
    """Fetch a single obligation by ID. Only the owner can retrieve it."""
    try:
        item = get_obligation_raw(obligation_id)
    except DynamoDBError as exc:
        logger.exception("Failed to fetch obligation %s", obligation_id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to fetch obligation from storage.",
        ) from exc

    if item is None or item.get("user_id") != current_user["user_id"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Obligation not found.")

    return StoredObligation.model_validate(item)


@router.patch("/{obligation_id}/status", response_model=StoredObligation)
async def update_obligation_status_endpoint(
    obligation_id: str,
    body: ObligationStatusUpdateRequest,
    current_user: dict = Depends(get_current_user),
) -> StoredObligation:
    """Update an obligation's status. Only the owner can update it.

    Valid statuses: `pending`, `in_progress`, `completed`, `blocked`.
    """
    try:
        updated = update_obligation_status(obligation_id, current_user["user_id"], body.status)
    except DynamoDBError as exc:
        logger.exception("Failed to update status for obligation %s", obligation_id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to update obligation status.",
        ) from exc

    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Obligation not found.")

    return updated
