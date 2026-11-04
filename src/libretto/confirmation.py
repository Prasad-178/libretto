"""Business-independent, immutable permits for a specific delivered readback."""

import hashlib
import json
from dataclasses import dataclass, replace


class ConfirmationBlocked(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class ConfirmationState:
    policy_id: str
    request_id: str
    fingerprint: str
    message_id: str
    epoch: int
    delivered: bool = False
    accepted_turn_id: str | None = None


@dataclass(frozen=True)
class DeliveryAck:
    message_id: str
    epoch: int
    completed: bool


def confirmation_fingerprint(policy_id: str, request_id: str, values: dict, fields: list[str]) -> str | None:
    if not fields or any(values.get(field) in (None, "") for field in fields):
        return None
    payload = {
        "policy": policy_id,
        "request": request_id,
        "values": {field: values[field] for field in sorted(fields)},
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def record_delivery(
    state: ConfirmationState, ack: DeliveryAck, *, current_request_id: str
) -> ConfirmationState:
    if state.request_id != current_request_id:
        raise ConfirmationBlocked("stale_request", "Readback belongs to another request")
    if state.message_id != ack.message_id or state.epoch != ack.epoch:
        raise ConfirmationBlocked("stale_delivery", "Delivery does not match the readback message and epoch")
    return replace(
        state,
        delivered=ack.completed,
        accepted_turn_id=state.accepted_turn_id if state.delivered and ack.completed else None,
    )


def accept_confirmation(
    state: ConfirmationState,
    *,
    current_request_id: str,
    current_fingerprint: str,
    turn_id: str,
    changed_fields: set[str],
) -> ConfirmationState:
    if state.request_id != current_request_id:
        raise ConfirmationBlocked("stale_request", "Confirmation belongs to another request")
    if changed_fields or current_fingerprint != state.fingerprint:
        raise ConfirmationBlocked("changed_details", "Confirmed details changed; deliver a new readback")
    if not state.delivered:
        raise ConfirmationBlocked("undelivered_readback", "Readback has not been completely delivered")
    if not turn_id:
        raise ConfirmationBlocked("missing_turn", "Confirmation requires a subsequent user turn")
    return replace(state, accepted_turn_id=turn_id)


def invalidate_confirmation(state: ConfirmationState) -> None:
    return None
