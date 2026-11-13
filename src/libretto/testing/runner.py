"""Deterministic boundaries around the production compiler and WorkflowRunner."""

import asyncio
from collections import deque
from copy import deepcopy
from pathlib import Path

from libretto import ParameterSpec, ToolDefinition, ToolRegistry, WorkflowRunner, compile_workflow
from libretto.events import ServerEvent
from libretto.state import Evaluation, GenerationContext, SessionState, ToolResult
from libretto.tool_contracts import ActionContext

from .evidence import EvidenceProjection
from .schema import Advance, Deliver, Expect, Interrupt, Scenario, ScenarioReport, Turn


class _Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


class _Inference:
    def __init__(self, scenario: Scenario) -> None:
        self.reply = scenario.reply
        self.evaluations = {step.id: step.evaluation for step in scenario.steps if isinstance(step, Turn)}

    async def stream_reply(self, context: GenerationContext):
        yield self.reply

    async def evaluate(self, context: GenerationContext) -> Evaluation:
        return self.evaluations[context.turn_id].model_copy(deep=True)


class _Tools:
    def __init__(self, scenario: Scenario) -> None:
        self.registry = ToolRegistry()
        self.calls: list[dict] = []
        self.failures: list[str] = []
        for name, spec in scenario.tools.items():
            self.registry.register(
                ToolDefinition(
                    name, tuple(ParameterSpec(k, v) for k, v in spec.parameters.items()), tuple(spec.results)
                ),
                self._handler(name, deque(spec.responses)),
            )

    def _handler(self, name: str, responses: deque[ToolResult]):
        async def handle(arguments: dict, context: ActionContext) -> ToolResult:
            self.calls.append(
                {"tool": name, "arguments": deepcopy(arguments), "request_id": context.request_id}
            )
            if not responses:
                self.failures.append(f"No scripted result for {name}")
                raise ValueError(self.failures[-1])
            return responses.popleft().model_copy(deep=True)

        return handle


def _check(step: Expect, state: SessionState, calls: list[dict], request_count: int) -> list[str]:
    expected = {
        "stage": step.stage,
        "action_count": step.action_count,
        "action_results": step.action_results,
        "request": step.request,
        "request_count": step.request_count,
        "action_arguments": step.action_arguments,
        "argument_fingerprints": step.argument_fingerprints,
    }
    actual = {
        "stage": state.active_stage,
        "action_count": len(state.receipts),
        "action_results": [item["status"] for item in state.receipts],
        "request": state.request.name if state.request else None,
        "request_count": request_count,
        "action_arguments": [call["arguments"] for call in calls],
        "argument_fingerprints": [receipt["argument_fingerprint"] for receipt in state.receipts],
    }
    failures = [
        f"{key}: expected {value!r}, got {actual[key]!r}"
        for key, value in expected.items()
        if value is not None and actual[key] != value
    ]
    facts = state.values()
    for key, value in step.facts.items():
        if key not in facts or type(facts[key]) is not type(value) or facts[key] != value:
            failures.append(f"fact {key}: expected {value!r}, got {facts.get(key)!r}")
    failures += [
        f"fact {key}: expected absent, got {facts[key]!r}" for key in step.absent_facts if key in facts
    ]
    return failures


async def run_scenario(scenario: Scenario, *, base_dir: Path, timeout: float = 2) -> ScenarioReport:
    """Run only scripted adapters; timeouts/event bounds turn stalls into failures.

    Workflow/compiler/file errors are setup errors (ValueError/OSError). Runtime
    failures and assertions belong to the returned report. Each checkpoint waits
    for tracked work, so absent actions aren't asserted before dispatch can occur.
    """
    source = base_dir / scenario.workflow
    tools, clock, inference = _Tools(scenario), _Clock(), _Inference(scenario)
    with source.open(encoding="utf-8", newline="") as handle:
        workflow_source = handle.read()
    compiled = compile_workflow(workflow_source, tools=tools.registry, project_root=source.parent)
    projection = EvidenceProjection(scenario, compiled)
    runner = WorkflowRunner(
        compiled, responder=inference, evaluator=inference, delivery_mode="external", clock=clock
    )
    events: list[ServerEvent] = []
    failures: list[str] = []
    requests: dict[str, str] = {}

    def remember(state: SessionState) -> None:
        if state.request:
            requests.setdefault(state.request.id, f"request-{len(requests) + 1}")

    async def collect() -> None:
        async for event in runner.events():
            if len(events) >= 5000:
                raise ValueError("Scenario exceeds 5,000 events")
            events.append(event)

    pump = asyncio.create_task(collect())
    state = runner.snapshot()
    remember(state)
    step_number = 0
    try:
        async with asyncio.timeout(timeout):
            await runner.start()
            await runner.wait_idle()
            for step_number, step in enumerate(scenario.steps, 1):
                if pump.done():
                    pump.result()  # Surface a failed event drain before proceeding.
                if isinstance(step, Turn):
                    await runner.submit(step.text, turn_id=step.id)
                elif isinstance(step, Deliver):
                    permit = runner.snapshot().confirmations.get(step.policy)
                    if permit is None:
                        failures.append(f"step {step_number}: no current readback for {step.policy}")
                        break
                    await runner.acknowledge_delivery(
                        permit.message_id, epoch=permit.epoch, completed=step.completed
                    )
                elif isinstance(step, Interrupt):
                    await runner.interrupt()
                elif isinstance(step, Advance):
                    clock.now += step.seconds
                await runner.wait_idle()
                state = runner.snapshot()
                remember(state)
                if isinstance(step, Expect):
                    failures += [
                        f"step {step_number}: {failure}"
                        for failure in _check(step, state, tools.calls, len(requests))
                    ]
            state = runner.snapshot()
    except TimeoutError:
        failures.append(f"step {step_number}: runtime stalled (deadline {timeout}s)")
    except Exception as error:
        failures.append(f"step {step_number}: {type(error).__name__}: {error}")
    finally:
        await runner.close()
        try:
            await pump
        except Exception as error:
            failures.append(str(error))

    failures += tools.failures
    codes = []
    stages = [compiled.workflow.start]
    for event in events:
        if event.type == "transition":
            stages.append(event.data["destination"])
        code = event.data.get("code") or event.type
        if event.type in {"expired", "action_blocked", "confirmation_withheld", "evaluation_error", "error"}:
            if code not in codes:
                codes.append(code)
        if event.type in {"evaluation_error", "error"}:
            failures.append(f"runtime {event.type}: {code}")
    passages = list(
        dict.fromkeys(
            passage["chunk_id"]
            for event in events
            if event.type == "retrieval"
            for passage in event.data.get("passages", [])
        )
    )
    for passage in scenario.expected_passages:
        if passage not in passages:
            failures.append(f"Expected passage {passage!r}; observed {passages!r}")
    completed = any(event.type in {"ended", "expired"} for event in events)
    for code in scenario.expected_codes:
        if code not in codes:
            failures.append(f"Expected reason {code!r}; observed {codes!r}")
    if scenario.expected_stages is not None and stages != scenario.expected_stages:
        failures.append(f"Expected stages {scenario.expected_stages!r}; observed {stages!r}")
    if scenario.completed is not None and completed != scenario.completed:
        failures.append(f"Expected completed={scenario.completed}; observed {completed}")
    actions = []
    for call, receipt in zip(tools.calls, state.receipts):
        actions.append(
            {
                "tool": call["tool"],
                "arguments": call["arguments"],
                "status": receipt["status"],
                "argument_fingerprint": receipt["argument_fingerprint"],
                "request": requests.get(receipt["request_id"], "no-request"),
            }
        )
    projection.finalize(state)
    return ScenarioReport(
        name=projection.clean(scenario.name),
        passed=not failures,
        failures=projection.clean(failures),
        stages=stages,
        facts=projection.facts(state.values()),
        actions=[projection.action(action) for action in actions],
        codes=codes,
        completed=completed,
        passages=projection.clean(passages),
        context=projection.context(),
        timeline=projection.timeline(events, requests),
    )
