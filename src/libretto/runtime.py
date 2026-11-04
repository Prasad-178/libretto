"""One connection, one actor. Speaking never universally awaits interpretation."""

import asyncio
import hashlib
import json
import re
import time
from collections import deque
from dataclasses import asdict, replace
from typing import AsyncIterator, Callable

from libretto.confirmation import (
    ConfirmationBlocked,
    ConfirmationState,
    DeliveryAck,
    accept_confirmation,
    confirmation_fingerprint,
    record_delivery,
)
from libretto.events import ServerEvent
from libretto.prompts import compose_prompt
from libretto.requests import begin_request, cancel_request
from libretto.schema import Edge, Workflow
from libretto.state import (
    Evaluation,
    Fact,
    GenerationContext,
    Message,
    SessionState,
    StageSnapshot,
    ToolResult,
)

CALL_LIMIT_SECONDS = 300


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
        self._events_finished = False
        self.defer_actions = False
        self.manual_delivery = False
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
        self.cancel_output = None
        self._message_count = 0
        self._refresh_readback = False
        self._speech_messages: dict[str, str] = {}
        self._begin_node_request(workflow.start)

    def _begin_node_request(self, node_id: str) -> None:
        name = self.workflow.nodes[node_id].begin_request
        if name is not None:
            self._pending = None
            begin_request(self.state, name, self.workflow.requests[name])

    def _context_current(self, context: GenerationContext) -> bool:
        request_id = self.state.request.id if self.state.request else None
        return (
            not self.closed
            and context.snapshot.epoch == self.epoch
            and context.snapshot.request_id == request_id
        )

    def _spawn(self, awaitable) -> asyncio.Task:
        task = asyncio.create_task(awaitable)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return task

    async def emit(self, kind: str, **data) -> None:
        event = ServerEvent(kind, self.epoch, data, self.clock() - self.created_at)
        if kind not in {"text_delta", "draft_ready"} and (kind != "playback" or data.get("drained")):
            self.trace.append(event)
        await self.queue.put(event)

    async def events(self) -> AsyncIterator[ServerEvent]:
        while not (self._events_finished and self.queue.empty()):
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
            tuple(replace(m) for m in self.state.history),
            self.state.readback_fingerprint,
            self.state.request.id if self.state.request else None,
            {key: permit.message_id for key, permit in self.state.confirmations.items() if permit.delivered},
        )

    async def publish_state(self) -> None:
        await self.emit(
            "state",
            session_id=self.state.session_id,
            request=asdict(self.state.request) if self.state.request else None,
            active_stage=self.state.active_stage,
            pending_stage=self.state.pending_stage,
            revision=self.state.revision,
            facts={key: asdict(fact) for key, fact in self.state.facts.items()},
            receipts=list(self.state.receipts),
        )

    async def welcome(self) -> None:
        text = self.workflow.welcome.strip()
        if not text or self.closed or self._current:
            return
        epoch = self.epoch
        self._message_count += 1
        message = Message(
            "assistant",
            "" if (self.defer_actions or self.manual_delivery) else text,
            "welcome",
            id=f"reply-{self._message_count}",
            epoch=epoch,
            generated_content=text,
            delivered=not (self.defer_actions or self.manual_delivery),
        )
        self.state.history.append(message)
        self._speaking = True
        try:
            await self.emit("first_text", turn_id="welcome", message_id=message.id, response_kind="welcome")
            await self.emit("text_delta", text=text, turn_id="welcome", message_id=message.id)
            await self.emit("response_done", text=text, turn_id="welcome", message_id=message.id)
        finally:
            if epoch == self.epoch:
                self._speaking = False

    async def submit_turn(self, text: str, turn_id: str, speculative: bool = False) -> None:
        if self.closed:
            return
        if self.clock() - self.created_at >= CALL_LIMIT_SECONDS:
            await self.emit("expired", message="The five-minute demo session has ended.")
            await self.close()
            return
        text = text.strip()
        if not text or len(text) > 8000 or turn_id in self._seen_turns:
            return
        if len(self._seen_turns) >= 60:
            await self.emit("error", code="turn_limit", message="Session turn limit reached.")
            return
        # New input invalidates undispatched work before any action can progress.
        await self.interrupt()
        if not speculative and self.state.request is None:
            self._begin_node_request(self.state.active_stage)
        node = self.workflow.nodes[self.state.active_stage]
        self._refresh_readback = bool(
            node.readback and node.confirmation and node.confirmation not in self.state.confirmations
        )
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
        reference = " ".join(
            m.content for m in snapshot.history[-3:] if m.role == "user" and m.turn_id != turn_id
        )
        retrieval_started = time.perf_counter()
        passages = self.retriever.search(text, sources, 3, context=reference)
        retrieval_ms = (time.perf_counter() - retrieval_started) * 1000
        await self.emit(
            "retrieval",
            turn_id=turn_id,
            duration_ms=retrieval_ms,
            query=text,
            context=reference,
            passages=[asdict(p) for p in passages],
        )
        context = compose_prompt(
            self.workflow, snapshot, passages, turn_id=turn_id, text=text, directory=self.directory
        )
        await self.emit("turn", turn_id=turn_id, text=text, speculative=speculative, stage=snapshot.stage)
        self._spawn(self._evaluate(context))
        self._spawn(self._respond(context))

    async def confirm_turn(self, text: str, turn_id: str) -> None:
        restart = self.state.request is None and self.workflow.nodes[self.state.active_stage].begin_request
        if self._current == (text.strip(), turn_id, self.epoch) and not restart:
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
        message = None
        try:
            async for delta in self.responder.stream_reply(context):
                if not self._context_current(context):
                    return
                if not delta:
                    continue
                if not collected:
                    self._message_count += 1
                    message = Message(
                        "assistant",
                        "",
                        context.turn_id,
                        id=f"reply-{self._message_count}",
                        epoch=epoch,
                        delivered=not (self.defer_actions or self.manual_delivery),
                    )
                    await self.emit(
                        "first_text",
                        turn_id=context.turn_id,
                        message_id=message.id,
                        response_kind="tool_result" if context.turn_id == "entry" else "reply",
                    )
                collected.append(delta)
                if sum(map(len, collected)) > 4000:
                    raise ValueError("Response output limit exceeded")
                if not self._confirmed.is_set():
                    await self.emit("draft_ready", turn_id=context.turn_id)
                    await self._confirmed.wait()
                    # Release the buffered first delta only after input commit.
                if epoch != self.epoch:
                    return
                if message not in self.state.history:
                    self.state.history.append(message)
                message.generated_content += delta
                if message.delivered:
                    message.content += delta
                await self.emit(
                    "text_delta",
                    text=delta,
                    turn_id=context.turn_id,
                    stage=context.snapshot.stage,
                    message_id=message.id,
                )
            if epoch == self.epoch and not self.closed:
                output = "".join(collected)
                if output and message:
                    self._record_readback()
                self._speaking = False
                await self.emit(
                    "response_done",
                    text=output,
                    turn_id=context.turn_id,
                    message_id=message.id if message else "",
                )
                await self._progress()
                self._schedule_readback_refresh(epoch)
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
        failure_code = "evaluation_failed"
        try:
            evaluation = await self.evaluator.evaluate(context)
            await self._confirmed.wait()
            if not self._context_current(context):
                return
            if not isinstance(evaluation, Evaluation):
                evaluation = Evaluation.model_validate(evaluation)
            proposals = {}
            for key, patch in evaluation.updates.items():
                if key not in self.workflow.fields:
                    failure_code = "unconfigured_fact"
                    raise ValueError("Unconfigured fact")
                if not normalized(patch.evidence) or normalized(patch.evidence) not in normalized(
                    context.text
                ):
                    failure_code = "invalid_evidence"
                    raise ValueError("Evidence does not occur in current turn")
                failure_code = "invalid_fact_value"
                value = (
                    self.workflow.fields[key].validate_value(patch.value)
                    if patch.status == "answered"
                    else None
                )
                proposals[key] = Fact(value, patch.status, patch.evidence, context.turn_id)
            current = self.state.values()
            changed = {key for key, fact in proposals.items() if current.get(key) != fact.value}
            accepted_fields = {p.acceptance_field for p in self.workflow.confirmations.values()}
            for policy_id, policy in self.workflow.confirmations.items():
                affected = changed.intersection(policy.fields)
                refused = any(
                    flag in proposals and proposals[flag].value is not True
                    for flag in (policy.acceptance_field, policy.consent_field)
                    if flag
                )
                if affected or refused:
                    self.state.confirmations.pop(policy_id, None)
                    self.state.facts.pop(policy.acceptance_field, None)
                    self.state.readback_fingerprint = None
                    if affected and self.workflow.nodes[context.snapshot.stage].confirmation == policy_id:
                        self._refresh_readback = True
            self.state.facts.update({k: v for k, v in proposals.items() if k not in accepted_fields})
            for policy_id, policy in self.workflow.confirmations.items():
                proposed = proposals.get(policy.acceptance_field)
                permit = self.state.confirmations.get(policy_id)
                if proposed and proposed.value is True and permit:
                    if context.snapshot.confirmation_messages.get(policy_id) != permit.message_id:
                        continue
                    try:
                        fingerprint = confirmation_fingerprint(
                            policy_id, permit.request_id, self.state.values(), policy.fields
                        )
                        self.state.confirmations[policy_id] = accept_confirmation(
                            permit,
                            current_request_id=self.state.request.id if self.state.request else "",
                            current_fingerprint=fingerprint or "",
                            turn_id=context.turn_id,
                            changed_fields=changed.intersection(policy.fields),
                        )
                        self.state.facts[policy.acceptance_field] = proposed
                    except ConfirmationBlocked:
                        pass
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
                if self.workflow.requests:
                    cancel_request(self.state)
                else:
                    self.state.facts.clear()
                self.state.readback_fingerprint = None
                await self.interrupt()
            elif evaluation.control == "stop_talking":
                await self.interrupt()
            await self.publish_state()
            await self._progress()
            self._schedule_readback_refresh(epoch)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            if epoch == self.epoch and not self.closed:
                await self.emit(
                    "evaluation_error",
                    code=getattr(exc, "code", failure_code),
                    message="State update rejected; existing state retained.",
                )

    def _record_readback(self) -> None:
        if not self.state.request:
            return
        for message in self.state.history:
            policy_id = message.confirmation_id
            permit = self.state.confirmations.get(policy_id)
            if permit and permit.message_id == message.id and message.delivered and not message.interrupted:
                try:
                    self.state.confirmations[policy_id] = record_delivery(
                        permit,
                        DeliveryAck(message.id, message.epoch, True),
                        current_request_id=self.state.request.id,
                    )
                    self.state.readback_fingerprint = permit.fingerprint
                except ConfirmationBlocked:
                    continue

    async def _progress(self) -> None:
        if self._speaking or self._progressing or not self._pending or self.closed:
            return
        owner = object()
        self._progressing = owner
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
                    if any(values.get(key) is None or values.get(key) == "" for key in node.requires):
                        await self.emit(
                            "action_blocked",
                            node=target,
                            reason="Required facts or confirmation are missing.",
                        )
                        return
                    if node.confirmation:
                        policy = self.workflow.confirmations[node.confirmation]
                        permit = self.state.confirmations.get(node.confirmation)
                        current_request = self.state.request
                        fingerprint = (
                            confirmation_fingerprint(
                                node.confirmation, current_request.id, values, policy.fields
                            )
                            if current_request
                            else None
                        )
                        if not (
                            current_request
                            and current_request.name == policy.request
                            and permit
                            and permit.request_id == current_request.id
                            and permit.accepted_turn_id
                            and permit.fingerprint == fingerprint
                            and permit.delivered
                            and (not policy.consent_field or values.get(policy.consent_field) is True)
                        ):
                            await self.emit(
                                "action_blocked",
                                node=target,
                                code="confirmation_required",
                                reason="The current request needs a delivered and accepted readback.",
                            )
                            return
                    if self.defer_actions:
                        self.state.pending_stage = target
                        self._spawn(self._after_playback(source, edge, epoch))
                        return
                self.state.active_stage = target
                self._begin_node_request(target)
                self.state.revision += 1
                await self.emit("transition", source=source, destination=target, edge=edge.id)
                await self.publish_state()
                if node.kind == "end":
                    if self.defer_actions:
                        await self._playback_done.wait()
                        if epoch != self.epoch:
                            return
                    await self.emit("ended", message="Conversation complete.")
                    await self.close()
                    return
                if node.kind == "action":
                    arguments = {key: values[field] for key, field in node.arguments.items()}
                    request_id = self.state.request.id if self.state.request else None
                    key = json.dumps([self.state.session_id, request_id, target])
                    argument_hash = hashlib.sha256(json.dumps(arguments, sort_keys=True).encode()).hexdigest()
                    previous = self._actions.get(key)
                    if previous is not None:
                        if previous["argument_hash"] != argument_hash:
                            await self.emit(
                                "action_blocked",
                                node=target,
                                code="action_arguments_changed",
                                reason="Start a new request before changing an already dispatched action.",
                            )
                        else:
                            await self.emit(
                                "action_already_completed",
                                node=target,
                                request_id=request_id,
                                idempotency_key=key,
                                status=previous.get("status", "unknown"),
                            )
                        return
                    self._actions[key] = {"argument_hash": argument_hash, "status": "unknown"}
                    await self.emit(
                        "tool_started",
                        tool=node.tool,
                        arguments=arguments,
                        request_id=request_id,
                        idempotency_key=key,
                    )
                    cancelled = False
                    # Historical dispatch may outlive cancellation. It must not own
                    # the current request's transition lock while awaiting an app.
                    self._progressing = False
                    try:
                        result = await self.tools.execute(node.tool, arguments, self.state, key)
                    except asyncio.CancelledError:
                        result = ToolResult(
                            status="unknown", data={"reason": "Action interrupted after dispatch"}
                        )
                        cancelled = True
                    except Exception:
                        result = ToolResult(
                            status="unknown", data={"reason": "Action outcome could not be established"}
                        )
                    receipt = {
                        "tool": node.tool,
                        **result.model_dump(),
                        "request_id": request_id,
                        "idempotency_key": key,
                        "argument_fingerprint": argument_hash,
                    }
                    self._actions[key] = {"argument_hash": argument_hash, "status": result.status}
                    self.state.receipts.append(receipt)
                    await self.emit("tool_result", **receipt)
                    if cancelled:
                        raise asyncio.CancelledError
                    current_request_id = self.state.request.id if self.state.request else None
                    if epoch != self.epoch or request_id != current_request_id or self.closed:
                        return
                    self._progressing = owner
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
                    self._message_count += 1
                    message = Message(
                        "assistant",
                        "" if (self.defer_actions or self.manual_delivery) else node.text,
                        "literal",
                        id=f"reply-{self._message_count}",
                        generated_content=node.text,
                        epoch=epoch,
                        delivered=not (self.defer_actions or self.manual_delivery),
                    )
                    self.state.history.append(message)
                    await self.emit("first_text", turn_id="literal", message_id=message.id)
                    await self.emit(
                        "text_delta", text=node.text, turn_id="literal", stage=target, message_id=message.id
                    )
                    await self.emit("response_done", text=node.text, turn_id="literal", message_id=message.id)
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
            if self._progressing is owner:
                self._progressing = False
            if not self._progressing and self._pending and not self.closed and not self._speaking:
                self._spawn(self._progress())

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

    def _schedule_readback_refresh(self, epoch: int) -> None:
        if self._refresh_readback and not self._speaking and epoch == self.epoch and not self.closed:
            self._refresh_readback = False
            if self.workflow.nodes[self.state.active_stage].readback:
                self._spawn(self._entry_response(epoch))

    async def _entry_response(self, epoch: int) -> None:
        if epoch != self.epoch or self.closed:
            return
        node = self.workflow.nodes[self.state.active_stage]
        if node.readback:
            from string import Formatter

            values = self.state.values()
            fields = {field for _, field, _, _ in Formatter().parse(node.readback) if field is not None}
            if any(values.get(field) is None or values.get(field) == "" for field in fields):
                await self.emit("readback_blocked", reason="Readback fields are incomplete.")
                return
            text = node.readback.format_map(values).strip()
            if len(text) > 4000:
                await self.emit("readback_blocked", reason="Readback exceeds the output limit.")
                return
            if any(
                m.epoch == epoch
                and not m.interrupted
                and m.readback_fingerprint
                and m.generated_content == text
                for m in self.state.history
            ):
                return
            self._message_count += 1
            turn_id = self._current[1] if self._current else "readback"
            message = Message(
                "assistant",
                "" if (self.defer_actions or self.manual_delivery) else text,
                turn_id,
                id=f"reply-{self._message_count}",
                generated_content=text,
                epoch=epoch,
                delivered=not (self.defer_actions or self.manual_delivery),
                readback_fingerprint=confirmation_fingerprint(
                    node.confirmation,
                    self.state.request.id,
                    values,
                    self.workflow.confirmations[node.confirmation].fields,
                )
                if node.confirmation and self.state.request
                else None,
                confirmation_id=node.confirmation,
                request_id=self.state.request.id if self.state.request else None,
            )
            self.state.history.append(message)
            if node.confirmation and message.readback_fingerprint and self.state.request:
                policy = self.workflow.confirmations[node.confirmation]
                self.state.confirmations[node.confirmation] = ConfirmationState(
                    node.confirmation,
                    self.state.request.id,
                    message.readback_fingerprint,
                    message.id,
                    epoch,
                    delivered=message.delivered or not policy.require_delivery,
                )
            self._speaking = True
            try:
                await self.emit("readback", message_id=message.id, fields=sorted(fields))
                await self.emit(
                    "first_text", turn_id=turn_id, message_id=message.id, response_kind="readback"
                )
                await self.emit("text_delta", text=text, turn_id=turn_id, message_id=message.id)
                self._record_readback()
                await self.emit("response_done", text=text, turn_id=turn_id, message_id=message.id)
            finally:
                if epoch == self.epoch:
                    self._speaking = False
            return
        context = compose_prompt(
            self.workflow,
            self.snapshot(),
            [],
            turn_id="entry",
            text="Continue using the actual tool result.",
            directory=self.directory,
        )
        request_id = self.state.request.id if self.state.request else None
        current_receipts = [
            receipt for receipt in self.state.receipts if receipt.get("request_id") == request_id
        ]
        if current_receipts:
            from dataclasses import replace

            context = replace(
                context, system=context.system + f"\nACTUAL TOOL RECEIPT: {current_receipts[-1]}"
            )
        self._speaking = True
        await self._respond(context)

    def bind_speech(self, speech_id: str, message_id: str) -> None:
        self._speech_messages[speech_id] = message_id

    def reconcile_speech(self, speech_id: str, spoken: str, *, interrupted: bool) -> None:
        message_id = self._speech_messages.get(speech_id)
        message = next((m for m in self.state.history if m.id == message_id), None)
        if message and not message.delivered:
            message.content = spoken[:4000]
            message.delivered = not interrupted
            message.interrupted = interrupted
            if interrupted:
                self.state.readback_fingerprint = None
                if message.confirmation_id:
                    self.state.confirmations.pop(message.confirmation_id, None)

    def acknowledge_message_delivery(
        self, message_id: str, *, epoch: int, completed: bool, allow_historical: bool = False
    ) -> None:
        message = next((m for m in self.state.history if m.id == message_id), None)
        request_id = self.state.request.id if self.state.request else None
        if self.closed or not message or message.epoch != epoch or epoch > self.epoch:
            raise ConfirmationBlocked("stale_delivery", "Delivery does not match output message/epoch")
        if allow_historical and epoch < self.epoch:
            # A late drain can restore heard history, never current permission.
            message.content = message.generated_content if completed else message.content
            message.delivered = completed
            message.interrupted = not completed
            return
        if (
            epoch != self.epoch
            or message.interrupted
            or (message.request_id is not None and message.request_id != request_id)
        ):
            raise ConfirmationBlocked("stale_delivery", "Delivery does not match current output")
        if message.confirmation_id:
            permit = self.state.confirmations.get(message.confirmation_id)
            if not permit:
                raise ConfirmationBlocked("missing_readback", "Readback is no longer eligible")
            self.state.confirmations[message.confirmation_id] = record_delivery(
                permit, DeliveryAck(message_id, epoch, completed), current_request_id=request_id or ""
            )
        message.content = message.generated_content if completed else ""
        message.delivered = completed
        message.interrupted = not completed
        if not completed and message.confirmation_id:
            self.state.confirmations.pop(message.confirmation_id, None)
        self._record_readback()

    def playback_finished(self, speech_id: str = "", *, epoch: int | None = None) -> bool:
        message_id = self._speech_messages.get(speech_id)
        message = next((m for m in self.state.history if m.id == message_id), None)
        if speech_id and not message:
            return False
        if message:
            try:
                self.acknowledge_message_delivery(
                    message.id,
                    epoch=message.epoch if epoch is None else epoch,
                    completed=True,
                    allow_historical=True,
                )
            except ConfirmationBlocked:
                return False
            if message.epoch != self.epoch:
                return True
        if all(
            m.delivered or m.interrupted
            for m in self.state.history
            if m.role == "assistant" and m.epoch == self.epoch
        ):
            self._playback_done.set()
        return True

    async def interrupt(self, notify: bool = True) -> None:
        was_speaking = self._speaking
        if self._current and not self._confirmed.is_set():
            self._seen_turns.discard(self._current[1])
        self.epoch += 1
        current = asyncio.current_task()
        for task in tuple(self._tasks):
            if task is not current:
                task.cancel()
        self._pending = None
        self.state.pending_stage = None
        self._refresh_readback = False
        self._speaking = False
        interrupted_ids = []
        for message in self.state.history:
            waived = (
                message.confirmation_id
                and not was_speaking
                and not self.workflow.confirmations[message.confirmation_id].require_delivery
            )
            if waived:
                continue
            if message.role == "assistant" and (
                not message.delivered
                or (
                    was_speaking
                    and message.epoch == self.epoch - 1
                    and self._current
                    and message.turn_id == self._current[1]
                )
            ):
                if not message.interrupted:
                    interrupted_ids.append(message.id)
                message.interrupted = True
        for message in self.state.history:
            if message.interrupted and message.confirmation_id:
                permit = self.state.confirmations.get(message.confirmation_id)
                if permit and permit.message_id == message.id:
                    self.state.confirmations.pop(message.confirmation_id, None)
        if (
            self.state.history
            and self.state.history[-1].role == "assistant"
            and self.state.history[-1].interrupted
        ):
            self.state.readback_fingerprint = None
        if notify:
            await self.emit("interrupted", message_ids=interrupted_ids)
        if self.cancel_output and not self.closed:
            await self.cancel_output()

    async def close(self) -> None:
        if self.closed:
            return
        self.closed = True
        if self.state.request:
            self.state.request.status = "completed"
        cancel_request(self.state)
        await self.interrupt(notify=False)
        tasks = [task for task in self._tasks if task is not asyncio.current_task()]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self._events_finished = True
        if not self.queue.full():
            self.queue.put_nowait(None)
