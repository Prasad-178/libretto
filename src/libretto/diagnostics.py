"""Describe an existing runtime veto without granting execution authority."""

from typing import Any

from libretto.schema import Node, Workflow
from libretto.state import SessionState


def action_block_details(
    node: Node,
    workflow: Workflow,
    state: SessionState,
    *,
    missing: list[str],
    fingerprint: str | None = None,
) -> dict[str, Any]:
    """Called only after the runtime's unchanged prerequisite/permit guard fails.

    Return identifiers and explanations, never fact values or fingerprints.
    """
    policy = workflow.confirmations.get(node.confirmation) if node.confirmation else None
    if missing:
        ordinary = [
            field
            for field in missing
            if not policy or field not in {policy.acceptance_field, policy.consent_field}
        ]
        if ordinary:
            code, reason = "missing_facts", "Collect the missing information before running this action."
        elif policy and policy.consent_field in missing:
            code, reason = "missing_consent", "The caller must explicitly consent to this request."
        elif policy and policy.acceptance_field in missing:
            code, reason = (
                "missing_acceptance",
                "The caller must approve the current complete readback on a later turn.",
            )
        else:
            code, reason = "missing_facts", "Collect the missing information before running this action."
        return {"code": code, "reason": reason, "missing_fields": missing}
    request = state.request
    permit = state.confirmations.get(node.confirmation)
    if not request:
        code, reason = "missing_request", "Start a request before running this guarded action."
    elif policy and (request.name != policy.request or permit and permit.request_id != request.id):
        code, reason = (
            "request_mismatch",
            "The confirmation belongs to a different request. Read back the current request again.",
        )
    elif not permit:
        code, reason = (
            "missing_readback",
            "Deliver a fresh readback for the current request before asking for approval.",
        )
    elif not permit.delivered:
        code, reason = (
            "undelivered_readback",
            "The complete current readback must be delivered before approval.",
        )
    elif permit.fingerprint != fingerprint:
        code, reason = (
            "stale_confirmation",
            "The confirmed details changed. Deliver a new readback and ask for approval again.",
        )
    elif not permit.accepted_turn_id:
        code, reason = (
            "missing_acceptance",
            "The caller must approve the current complete readback on a later turn.",
        )
    elif policy and policy.consent_field and state.values().get(policy.consent_field) is not True:
        return {
            "code": "missing_consent",
            "reason": "The caller must explicitly consent to this request.",
            "missing_fields": [policy.consent_field],
        }
    else:
        code, reason = "confirmation_required", "The current request needs a delivered and accepted readback."
    return {"code": code, "reason": reason, "missing_fields": []}
