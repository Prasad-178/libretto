"""One connection, one actor. Speaking never universally awaits interpretation."""

import asyncio
import re
import time
from collections import deque
from dataclasses import asdict
from typing import AsyncIterator, Callable

from libretto.events import ServerEvent
from libretto.prompts import compose_prompt
from libretto.schema import Edge, Workflow
from libretto.state import (
    DETAIL_FIELDS,
    Evaluation,
    Fact,
    GenerationContext,
    Message,
    SessionState,
    StageSnapshot,
    details_fingerprint,
)


def normalized(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


class Session:
    def __init__(
        self,
        workflow: Workflow,
        responder,
        evaluator,
        retriever,
        tools,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.workflow, self.responder, self.evaluator = workflow, responder, evaluator
        self.retriever, self.tools, self.clock = retriever, tools, clock
        self.state = SessionState(workflow.start)
        self.epoch = 0
        self.created_at = clock()
        self.closed = False
        self.defer_actions = False
        self.trace: deque[ServerEvent] = deque(maxlen=500)
        self.queue: asyncio.Queue[ServerEvent | None] = asyncio.Queue(maxsize=600)
        self._tasks: set[asyncio.Task] = set()
        self._speaking = False
        self._pending: tuple[str, Edge, int] | None = None
        self._progressing = False
        self._current: tuple[str, str, int] | None = None
        self._confirmed = asyncio.Event()
        self._playback_done = asyncio.Event()
        self._playback_done.set()
        self._seen_turns: set[str] = set()
        self._actions: dict[str, dict] = {}
        self.directory = ""

    def _spawn(self, awaitable) -> asyncio.Task:
        task = asyncio.create_task(awaitable)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return task

    async def emit(self, kind: str, **data) -> None:
        event = ServerEvent(kind, self.epoch, data, self.clock() - self.created_at)
        self.trace.append(event)
        await self.queue.put(event)

    async def events(self) -> AsyncIterator[ServerEvent]:
        while True:
            event = await self.queue.get()
            if event is None:
                break
            yield event

    def snapshot(self) -> StageSnapshot:
        return StageSnapshot(
            self.state.active_stage,
            self.state.revision,
            self.epoch,
            dict(self.state.values()),
            tuple(self.state.history),
        )

    async def publish_state(self) -> None:
        await self.emit(
            "state",
            active_stage=self.state.active_stage,
            pending_stage=self.state.pending_stage,
            revision=self.state.revision,
            facts={key: asdict(fact) for key, fact in self.state.facts.items()},
            receipts=list(self.state.receipts),
        )

    async def submit_turn(self, text: str, turn_id: str, speculative: bool = False) -> None:
        if self.closed:
            return
        if self.clock() - self.created_at >= 180:
            await self.emit("expired", message="The three-minute demo session has ended.")
            await self.close()
            return
        text = text.strip()
        if not text or len(text) > 8000 or turn_id in self._seen_turns:
            return
        if len(self._seen_turns) >= 60:
            await self.emit("error", code="turn_limit", message="Session turn limit reached.")
            return
        # New input invalidates undispatched work before any action can progress.
        await self.interrupt(notify=False)
        self._seen_turns.add(turn_id)
        self._current = (text, turn_id, self.epoch)
        self._confirmed = asyncio.Event()
        if not speculative:
            self._confirmed.set()
            self.state.history.append(Message("user", text, turn_id))
        self._playback_done.clear() if self.defer_actions else self._playback_done.set()
        self._speaking = True
        snapshot = self.snapshot()
        sources = list(
            dict.fromkeys(self.workflow.common_knowledge + self.workflow.nodes[snapshot.stage].knowledge)
        )
        query = " ".join(m.content for m in snapshot.history[-3:] if m.role == "user") + " " + text
        passages = self.retriever.search(query, sources, 3)
        await self.emit("retrieval", query=query, passages=[asdict(p) for p in passages])
        context = compose_prompt(
            self.workflow, snapshot, passages, turn_id=turn_id, text=text, directory=self.directory
        )
        await self.emit("turn", turn_id=turn_id, text=text, speculative=speculative, stage=snapshot.stage)
        self._spawn(self._evaluate(context))
        self._spawn(self._respond(context))

    async def confirm_turn(self, text: str, turn_id: str) -> None:
        if self._current == (text.strip(), turn_id, self.epoch):
            if not self._confirmed.is_set():
                self.state.history.append(Message("user", text.strip(), turn_id))
                self._confirmed.set()
                await self.emit("turn_confirmed", turn_id=turn_id)
            return
        # Final transcript differs: discard the draft and use the final input.
        self._seen_turns.discard(turn_id)
        await self.submit_turn(text, turn_id)

    async def _respond(self, context: GenerationContext) -> None:
        epoch = context.snapshot.epoch
        collected: list[str] = []
        try:
            async for delta in self.responder.stream_reply(context):
                if epoch != self.epoch or self.closed:
                    return
                if not delta:
                    continue
                if not collected:
                    await self.emit("first_text", turn_id=context.turn_id)
                collected.append(delta)
                if sum(map(len, collected)) > 4000:
                    raise ValueError("Response output limit exceeded")
                if not self._confirmed.is_set():
                    await self.emit("draft_ready", turn_id=context.turn_id)
                    await self._confirmed.wait()
                    # Release the buffered first delta only after input commit.
                if epoch != self.epoch:
                    return
                await self.emit(
                    "text_delta", text=delta, turn_id=context.turn_id, stage=context.snapshot.stage
                )
            if epoch == self.epoch and not self.closed:
                output = "".join(collected)
                if output:
                    self.state.history.append(Message("assistant", output, context.turn_id))
                    self._record_readback()
                self._speaking = False
                await self.emit("response_done", text=output, turn_id=context.turn_id)
                await self._progress()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            if epoch == self.epoch:
                self._speaking = False
                await self.emit(
                    "error",
                    code=getattr(exc, "code", "generation_failed"),
                    message=getattr(exc, "public_message", "The response could not be completed."),
                )

    async def _evaluate(self, context: GenerationContext) -> None:
        epoch = context.snapshot.epoch
        try:
            evaluation = await self.evaluator.evaluate(context)
            await self._confirmed.wait()
            if epoch != self.epoch or self.closed:
                return
            if not isinstance(evaluation, Evaluation):
                evaluation = Evaluation.model_validate(evaluation)
            proposals = {}
            for key, patch in evaluation.updates.items():
                if key not in self.workflow.fields:
                    raise ValueError("Unconfigured fact")
                if not patch.evidence.strip() or normalized(patch.evidence) not in normalized(context.text):
                    raise ValueError("Evidence does not occur in current turn")
                value = (
                    self.workflow.fields[key].validate_value(patch.value)
                    if patch.status == "answered"
                    else None
                )
                proposals[key] = Fact(value, patch.status, patch.evidence, context.turn_id)
            current = self.state.values()
            changed = {key for key, fact in proposals.items() if current.get(key) != fact.value}
            if changed.intersection(DETAIL_FIELDS):
                self.state.facts.pop("message_confirmed", None)
                self.state.readback_fingerprint = None
            if "recipient" in changed:
                self.state.facts.pop("destination_confirmed", None)
            self.state.facts.update({k: v for k, v in proposals.items() if k != "message_confirmed"})
            self._record_readback()
            if "message_confirmed" in proposals:
                if (
                    self.state.readback_fingerprint == details_fingerprint(self.state.values())
                    and self.state.readback_fingerprint
                ):
                    self.state.facts["message_confirmed"] = proposals["message_confirmed"]
            self.state.revision += 1
            node = self.workflow.nodes[context.snapshot.stage]
            selected = next(
                (
                    edge
                    for edge in node.edges
                    if edge.predicate and edge.predicate.matches(self.state.values())
                ),
                None,
            )
            if selected is None:
                selected = next(
                    (edge for edge in node.edges if edge.id in evaluation.matches and edge.condition), None
                )
            if selected:
                self._pending = (context.snapshot.stage, selected, epoch)
                self.state.pending_stage = selected.to
            await self.emit(
                "evaluation",
                updates=list(proposals),
                matches=evaluation.matches,
                reason=evaluation.reason,
                stage=context.snapshot.stage,
            )
            if evaluation.control == "end_call":
                await self.emit("ended", message="Call ended.")
                await self.close()
                return
            if evaluation.control == "cancel_request":
                self._pending = None
                self.state.pending_stage = None
                self.state.active_stage = self.workflow.start
                self.state.facts.clear()
                self.state.readback_fingerprint = None
                await self.interrupt()
            elif evaluation.control == "stop_talking":
                await self.interrupt()
            await self.publish_state()
            await self._progress()
        except asyncio.CancelledError:
            raise
        except Exception:
            if epoch == self.epoch and not self.closed:
                await self.emit("evaluation_error", message="State update rejected; existing state retained.")

    def _record_readback(self) -> None:
        values = self.state.values()
        fingerprint = details_fingerprint(values)
        if fingerprint and self.state.history:
            last = next((m for m in reversed(self.state.history) if m.role == "assistant"), None)
            current_user = next((m for m in reversed(self.state.history) if m.role == "user"), None)
            if (
                last
                and current_user
                and last.turn_id == current_user.turn_id
                and "?" in last.content
                and all(normalized(str(values[k])) in normalized(last.content) for k in DETAIL_FIELDS)
            ):
                self.state.readback_fingerprint = fingerprint

    async def _progress(self) -> None:
        if self._speaking or self._progressing or not self._pending or self.closed:
            return
        self._progressing = True
        try:
            source, edge, epoch = self._pending
            self._pending = None
            self.state.pending_stage = None
            if epoch != self.epoch or source != self.state.active_stage:
                return
            target = edge.to
            for _ in range(12):
                node = self.workflow.nodes[target]
                if node.kind == "action":
                    values = self.state.values()
                    if not all(values.get(key) for key in node.requires):
                        await self.emit(
                            "action_blocked",
                            node=target,
                            reason="Required facts or confirmation are missing.",
                        )
                        return
                    if node.tool == "capture_message" and (
                        not self.state.readback_fingerprint
                        or self.state.readback_fingerprint != details_fingerprint(values)
                    ):
                        await self.emit(
                            "action_blocked",
                            node=target,
                            reason="The current details need a confirmed readback.",
                        )
                        return
                    if self.defer_actions:
                        self.state.pending_stage = target
                        self._spawn(self._after_playback(source, edge, epoch))
                        return
                self.state.active_stage = target
                self.state.revision += 1
                await self.emit("transition", source=source, destination=target, edge=edge.id)
                await self.publish_state()
                if node.kind == "end":
                    await self.emit("ended", message="Conversation complete.")
                    return
                if node.kind == "action":
                    arguments = {key: values[field] for key, field in node.arguments.items()}
                    key = f"{target}:{details_fingerprint(values) or str(arguments)}"
                    receipt = self._actions.get(key)
                    if receipt is None:
                        await self.emit("tool_started", tool=node.tool, arguments=arguments)
                        result = await self.tools.execute(node.tool, arguments, self.state, key)
                        receipt = {"tool": node.tool, **result.model_dump()}
                        self._actions[key] = receipt
                        self.state.receipts.append(receipt)
                    await self.emit("tool_result", **receipt)
                    if epoch != self.epoch:
                        return
                    next_edge = next((e for e in node.edges if e.result == receipt["status"]), None)
                    if not next_edge:
                        await self.emit(
                            "error",
                            code="unhandled_tool_result",
                            message="No recovery branch for this result.",
                        )
                        return
                    source, edge, target = target, next_edge, next_edge.to
                    continue
                if node.kind == "say":
                    await self.emit("text_delta", text=node.text, turn_id="literal", stage=target)
                    await self.emit("response_done", text=node.text, turn_id="literal")
                    source, edge, target = target, node.edges[0], node.edges[0].to
                    continue
                deterministic = next(
                    (e for e in node.edges if e.predicate and e.predicate.matches(self.state.values())), None
                )
                if deterministic:
                    source, edge, target = target, deterministic, deterministic.to
                    continue
                # A new conversation stage waits unless explicitly generating on entry.
                if node.entry == "respond":
                    self._spawn(self._entry_response(epoch))
                return
            await self.emit("error", code="transition_limit", message="Workflow transition limit reached.")
        finally:
            self._progressing = False

    async def _after_playback(self, source: str, edge: Edge, epoch: int) -> None:
        await self._playback_done.wait()
        if epoch != self.epoch or self.closed:
            return
        self.defer_actions = False
        try:
            self._pending = (source, edge, epoch)
            await self._progress()
        finally:
            self.defer_actions = True

    async def _entry_response(self, epoch: int) -> None:
        if epoch != self.epoch or self.closed:
            return
        context = compose_prompt(
            self.workflow,
            self.snapshot(),
            [],
            turn_id="entry",
            text="Continue using the actual tool result.",
            directory=self.directory,
        )
        if self.state.receipts:
            from dataclasses import replace

            context = replace(
                context, system=context.system + f"\nACTUAL TOOL RECEIPT: {self.state.receipts[-1]}"
            )
        self._speaking = True
        await self._respond(context)

    def playback_finished(self) -> None:
        self._playback_done.set()

    async def interrupt(self, notify: bool = True) -> None:
        if self._current and not self._confirmed.is_set():
            self._seen_turns.discard(self._current[1])
        self.epoch += 1
        current = asyncio.current_task()
        for task in tuple(self._tasks):
            if task is not current:
                task.cancel()
        self._pending = None
        self.state.pending_stage = None
        self._speaking = False
        if notify:
            await self.emit("interrupted")

    async def close(self) -> None:
        if self.closed:
            return
        self.closed = True
        await self.interrupt(notify=False)
        if not self.queue.full():
            self.queue.put_nowait(None)
