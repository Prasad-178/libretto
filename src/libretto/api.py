"""Supported application facade over the single Libretto session engine."""

from copy import deepcopy
from typing import AsyncIterator, Literal

from libretto.compiler import CompiledWorkflow
from libretto.confirmation import ConfirmationBlocked, DeliveryAck, record_delivery
from libretto.events import ServerEvent
from libretto.providers.base import Evaluator, Responder
from libretto.runtime import Session
from libretto.state import SessionState


class WorkflowRunner:
    def __init__(
        self,
        compiled: CompiledWorkflow,
        *,
        responder: Responder,
        evaluator: Evaluator,
        delivery_mode: Literal["text", "external"] = "text",
    ):
        if delivery_mode not in {"text", "external"}:
            raise ValueError("Unsupported delivery mode")
        self.delivery_mode = delivery_mode
        self._session = Session(
            compiled.workflow.model_copy(deep=True),
            responder,
            evaluator,
            deepcopy(compiled.index),
            compiled.tools.snapshot(),
        )
        self._session.manual_delivery = True
        self._started = False

    async def start(self) -> None:
        if self._started or self._session.closed:
            return
        self._started = True
        self._session._confirmed.set()
        await self._session.welcome()
        node = self._session.workflow.nodes[self._session.state.active_stage]
        if node.entry == "respond":
            self._session._spawn(self._session._entry_response(self._session.epoch))

    async def submit(self, text: str, *, turn_id: str) -> None:
        if not turn_id or not text.strip():
            raise ValueError("Supply nonempty text and a stable turn_id")
        await self.start()
        await self._session.submit_turn(text, turn_id)

    async def events(self) -> AsyncIterator[ServerEvent]:
        async for event in self._session.events():
            if (
                self.delivery_mode == "text"
                and event.type == "response_done"
                and event.data.get("message_id")
            ):
                try:
                    await self.acknowledge_delivery(
                        event.data["message_id"], epoch=event.epoch, completed=True
                    )
                except ConfirmationBlocked:
                    pass  # Superseded output is not delivered by this transport.
            yield deepcopy(event)

    async def acknowledge_delivery(self, message_id: str, *, epoch: int, completed: bool) -> None:
        session = self._session
        message = next((m for m in session.state.history if m.id == message_id), None)
        request_id = session.state.request.id if session.state.request else None
        if (
            session.closed
            or not message
            or epoch != session.epoch
            or message.epoch != epoch
            or message.interrupted
            or (message.request_id is not None and message.request_id != request_id)
        ):
            raise ConfirmationBlocked("stale_delivery", "Delivery does not match current output")
        if message.confirmation_id:
            permit = session.state.confirmations.get(message.confirmation_id)
            if not permit:
                raise ConfirmationBlocked("missing_readback", "Readback is no longer eligible")
            session.state.confirmations[message.confirmation_id] = record_delivery(
                permit, DeliveryAck(message_id, epoch, completed), current_request_id=request_id or ""
            )
        message.content = message.generated_content if completed else ""
        message.delivered = completed
        message.interrupted = not completed
        if not completed and message.confirmation_id:
            session.state.confirmations.pop(message.confirmation_id, None)
        session._record_readback()

    async def interrupt(self) -> None:
        await self._session.interrupt()

    async def close(self) -> None:
        await self._session.close()

    def snapshot(self) -> SessionState:
        return deepcopy(self._session.state)
