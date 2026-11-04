"""Explicit single-request state boundaries, independent of business field names."""
from uuid import uuid4

from libretto.schema import RequestSpec
from libretto.state import RequestState, SessionState


def cancel_request(state: SessionState) -> None:
    if state.request:
        if state.request.status == 'active':
            state.request.status = 'cancelled'
        for field in state.request.fields:
            state.facts.pop(field, None)
    state.request = None
    state.confirmations.clear()
    state.readback_fingerprint = None
    state.pending_stage = None


def begin_request(state: SessionState, name: str, spec: RequestSpec) -> RequestState:
    cancel_request(state)
    for field in spec.fields:
        state.facts.pop(field, None)
    state.request = RequestState(uuid4().hex, name, fields=tuple(spec.fields))
    state.revision += 1
    return state.request
