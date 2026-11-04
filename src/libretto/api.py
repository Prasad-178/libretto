"""Supported application facade over the single Libretto session engine."""

from copy import deepcopy
from typing import AsyncIterator, Literal

from libretto.compiler import CompiledWorkflow
from libretto.confirmation import ConfirmationBlocked
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

    async def start(self) -> None:
        await self._session.start()

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
        self._session.acknowledge_message_delivery(message_id, epoch=epoch, completed=completed)

    async def interrupt(self) -> None:
        await self._session.interrupt()

    async def close(self) -> None:
        await self._session.close()

    def snapshot(self) -> SessionState:
        return deepcopy(self._session.state)
