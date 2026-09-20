"""Rule-based risk and bottleneck analysis for obligations.

This module deliberately does NOT use an LLM to assign risk. Every risk
level and reason is computed from explicit, inspectable rules applied to
the obligation's own status/deadline and its position in the dependency
graph (built from `app/services/dynamodb_client.py` obligations and
relationships). Given the same data, this always produces the same
result, and every result can be traced back to the specific rule that
produced it — that's the "rule-based and explainable" requirement.

Deadlines are resolved via `app/services/deadline_parser.py`, which
returns `None` for any deadline text that doesn't state a genuine
absolute date (relative/recurring phrasing is never guessed into a date).
Obligations with an unresolvable deadline are still evaluated for
blocking/blocked/chain risk, just not for overdue/approaching-deadline
risk, since there's no date to compare against.
"""

from dataclasses import dataclass, field
from datetime import date

from app.schemas.documents import ObligationRisk, RiskLevel, StoredObligation, StoredRelationship
from app.services.deadline_parser import days_remaining

APPROACHING_DEADLINE_DAYS = 7
BLOCKS_MANY_THRESHOLD = 3


@dataclass
class _ObligationGraphContext:
    """Precomputed graph relationships needed for risk evaluation."""

    # obligation_id -> list of obligation_ids that depend on it (i.e. it
    # blocks them until it's done). Derived from stored relationships:
    # from_obligation_id depends_on/conditional_on to_obligation_id means
    # to_obligation_id blocks from_obligation_id.
    blocks: dict[str, list[str]] = field(default_factory=dict)
    # obligation_id -> list of obligation_ids it depends on (its own
    # prerequisites).
    depends_on: dict[str, list[str]] = field(default_factory=dict)


def _build_graph_context(relationships: list[StoredRelationship]) -> _ObligationGraphContext:
    context = _ObligationGraphContext()
    for relationship in relationships:
        if relationship.relationship_type in ("depends_on", "conditional_on"):
            # from_obligation_id depends on to_obligation_id, so
            # to_obligation_id blocks from_obligation_id.
            context.blocks.setdefault(relationship.to_obligation_id, []).append(relationship.from_obligation_id)
            context.depends_on.setdefault(relationship.from_obligation_id, []).append(relationship.to_obligation_id)
        elif relationship.relationship_type == "blocks":
            # from_obligation_id explicitly blocks to_obligation_id.
            context.blocks.setdefault(relationship.from_obligation_id, []).append(relationship.to_obligation_id)
            context.depends_on.setdefault(relationship.to_obligation_id, []).append(relationship.from_obligation_id)
        # "follows" is a sequencing hint without a hard blocking
        # relationship, so it does not contribute to blocked/blocking risk.
    return context


def _is_open(obligation: StoredObligation) -> bool:
    """True if the obligation still needs action (not completed)."""
    return obligation.status != "completed"


def evaluate_obligation_risk(
    obligation: StoredObligation,
    context: _ObligationGraphContext,
    obligations_by_id: dict[str, StoredObligation],
    today: date | None = None,
) -> ObligationRisk | None:
    """Evaluate a single obligation's risk. Returns `None` if it has no risk factors.

    Every reason string names the specific rule that fired, so the result
    can be checked directly against the obligation's own data and its
    graph position.
    """
    reference_today = today or date.today()
    reasons: list[str] = []

    is_overdue = False
    is_approaching = False
    remaining = days_remaining(obligation.deadline, today=reference_today)

    if _is_open(obligation) and remaining is not None:
        if remaining < 0:
            is_overdue = True
            reasons.append(f"Overdue by {abs(remaining)} day{'s' if abs(remaining) != 1 else ''}.")
        elif remaining <= APPROACHING_DEADLINE_DAYS:
            is_approaching = True
            reasons.append(f"Deadline in {remaining} day{'s' if remaining != 1 else ''}.")

    is_blocked_status = obligation.status == "blocked"
    if is_blocked_status:
        reasons.append("Marked as blocked.")

    downstream_ids = context.blocks.get(obligation.obligation_id, [])
    open_downstream_ids = [
        downstream_id
        for downstream_id in downstream_ids
        if downstream_id in obligations_by_id and _is_open(obligations_by_id[downstream_id])
    ]
    blocked_count = len(open_downstream_ids)
    if blocked_count > 0:
        downstream_actions = [
            obligations_by_id[downstream_id].action or "an unnamed obligation"
            for downstream_id in open_downstream_ids
        ]
        reasons.append(
            f"Blocks {blocked_count} other obligation{'s' if blocked_count != 1 else ''}: "
            + ", ".join(f'"{action}"' for action in downstream_actions)
            + "."
        )

    # Chain risk: does this obligation depend on something upstream that
    # is itself overdue, blocked, or approaching its deadline (and still
    # open)? This propagates risk forward through the dependency chain
    # without re-deriving each upstream obligation's own risk level here
    # — it only needs to know whether an upstream prerequisite is itself
    # in trouble.
    upstream_ids = context.depends_on.get(obligation.obligation_id, [])
    at_risk_upstream_actions: list[str] = []
    for upstream_id in upstream_ids:
        upstream = obligations_by_id.get(upstream_id)
        if upstream is None or not _is_open(upstream):
            continue
        upstream_remaining = days_remaining(upstream.deadline, today=reference_today)
        upstream_overdue = upstream_remaining is not None and upstream_remaining < 0
        upstream_approaching = upstream_remaining is not None and 0 <= upstream_remaining <= APPROACHING_DEADLINE_DAYS
        upstream_blocked = upstream.status == "blocked"
        if upstream_overdue or upstream_approaching or upstream_blocked:
            at_risk_upstream_actions.append(upstream.action or "an unnamed obligation")

    is_chain_at_risk = len(at_risk_upstream_actions) > 0
    if is_chain_at_risk:
        reasons.append(
            "Depends on a prerequisite that is itself at risk: "
            + ", ".join(f'"{action}"' for action in at_risk_upstream_actions)
            + "."
        )

    if not reasons:
        return None

    risk_level = _compute_risk_level(
        is_overdue=is_overdue,
        is_approaching=is_approaching,
        is_blocked_status=is_blocked_status,
        blocked_count=blocked_count,
        is_chain_at_risk=is_chain_at_risk,
    )

    return ObligationRisk(
        obligation_id=obligation.obligation_id,
        action=obligation.action,
        risk_level=risk_level,
        reason=" ".join(reasons),
        blocked_count=blocked_count,
        days_remaining=remaining,
    )


def _compute_risk_level(
    *,
    is_overdue: bool,
    is_approaching: bool,
    is_blocked_status: bool,
    blocked_count: int,
    is_chain_at_risk: bool,
) -> RiskLevel:
    """Deterministic risk-level rule table. No LLM involved.

    Rules are evaluated most-severe-first; the first matching rule wins.
    """
    if is_overdue and blocked_count > 0:
        return "critical"
    if is_overdue:
        return "high"
    if blocked_count >= BLOCKS_MANY_THRESHOLD:
        return "high"
    if is_approaching and blocked_count > 0:
        return "high"
    if is_approaching:
        return "medium"
    if is_blocked_status:
        return "medium"
    if blocked_count > 0:
        return "medium"
    if is_chain_at_risk:
        return "medium"
    return "low"


_RISK_LEVEL_WEIGHT: dict[RiskLevel, float] = {
    "low": 1.0,
    "medium": 2.0,
    "high": 3.0,
    "critical": 4.0,
}


def compute_priority_score(risk: ObligationRisk) -> float:
    """Compute a transparent priority score from risk level, deadline urgency, and blocking impact.

    Higher means more urgent. This is a simple weighted sum, not a
    model prediction — each term is directly visible in the `ObligationRisk`
    the score was computed from:

      score = risk_level_weight * 10
            + urgency_term (higher the sooner/more overdue the deadline is; 0 if unresolvable)
            + blocked_count * 2

    `urgency_term` uses `max(0, 14 - days_remaining)` so a deadline that's
    today or already overdue contributes the most, urgency tapers off
    linearly over a two-week horizon, and it never goes negative for
    deadlines further out (they simply don't get an urgency boost).
    """
    risk_weight = _RISK_LEVEL_WEIGHT[risk.risk_level] * 10

    urgency_term = 0.0
    if risk.days_remaining is not None:
        urgency_term = max(0, 14 - risk.days_remaining)

    blocking_term = risk.blocked_count * 2

    return risk_weight + urgency_term + blocking_term


def analyze_risks(
    obligations: list[StoredObligation],
    relationships: list[StoredRelationship],
    today: date | None = None,
) -> list[ObligationRisk]:
    """Evaluate every obligation and return risk entries for the ones that have risk factors.

    Obligations with no risk factors (no overdue/approaching deadline, not
    blocked, blocking nothing open, no at-risk prerequisites) are omitted
    entirely rather than returned with a `"low"` placeholder — this keeps
    the endpoint focused on what actually needs attention.
    """
    context = _build_graph_context(relationships)
    obligations_by_id = {obligation.obligation_id: obligation for obligation in obligations}

    risks: list[ObligationRisk] = []
    for obligation in obligations:
        if not _is_open(obligation):
            continue
        risk = evaluate_obligation_risk(obligation, context, obligations_by_id, today=today)
        if risk is not None:
            risks.append(risk)

    return risks
