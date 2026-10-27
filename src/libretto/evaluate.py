"""Repeatable retrieval checks and bounded, opt-in real-model workflow evaluation."""

import asyncio
import json
import os
import statistics
import time
from pathlib import Path

from libretto.providers.base import SessionCredentials
from libretto.providers.openrouter import OpenRouterAdapter
from libretto.retrieval import build_index
from libretto.runtime import Session
from libretto.schema import load_workflow
from libretto.state import Message
from libretto.tools import ToolRegistry

# Expected facts are independent of the retriever's implementation.
RETRIEVAL_CASES = [
    ("What membership options do you have?", "", ["£220", "£360"]),
    ("What facilities do you have?", "", ["Wi-Fi", "lift"]),
    ("How much is a day pass?", "", ["£25"]),
    ("Do you have dedicated meeting rooms and are they priced separately?", "", ["£18", "£32"]),
    ("How much?", "Tell me about Loft.", ["£32"]),
    ("And pricing?", "Tell me about Loft.", ["£32"]),
    ("Can I cancel a room with 24 hours notice?", "", ["24 hours"]),
    ("Is support open on weekends?", "", ["closed"]),
]


def stats(values):
    return {
        "count": len(values),
        "mean_ms": statistics.mean(values) if values else None,
        "median_ms": statistics.median(values) if values else None,
        "max_ms": max(values) if values else None,
    }


def evaluate_retrieval(workflow_path: Path):
    workflow = load_workflow(workflow_path)
    index = build_index(workflow, workflow_path.parent)
    cases = []
    for query, context, expected in RETRIEVAL_CASES:
        started = time.perf_counter()
        passages = index.search(query, workflow.common_knowledge, 3, context=context)
        elapsed = (time.perf_counter() - started) * 1000
        text = " ".join(p.text for p in passages)
        cases.append(
            {
                "query": query,
                "context": context,
                "passed": all(value in text for value in expected),
                "expected": expected,
                "sources": [p.heading for p in passages],
                "retrieval_ms": elapsed,
            }
        )
    return {
        "kind": "local_retrieval",
        "cases": cases,
        "passed": all(c["passed"] for c in cases),
        "timing": stats([c["retrieval_ms"] for c in cases]),
        "measurement": "Local in-process search; excludes index loading, network and generation.",
    }


async def evaluate_live(workflow_path: Path):
    """At most seven user turns / fourteen normal model requests plus tool-result replies.

    No microphone or TTS. Voice delivery is covered by transport/worklet regressions
    and manual hosted voice acceptance; these are explicitly text workflow checks.
    """
    from dotenv import load_dotenv

    load_dotenv()
    key = os.getenv("OPENROUTER_API_KEY")
    if not key:
        raise ValueError("Live evaluation requires OPENROUTER_API_KEY; no request was made.")
    flow = load_workflow(workflow_path)
    directory = json.loads((workflow_path.parent / "directory.json").read_text())
    adapter = OpenRouterAdapter(SessionCredentials(openrouter=key), flow.models)
    cases = []

    async def run_session(name, seed, turns, check):
        session = Session(
            flow, adapter, adapter, build_index(flow, workflow_path.parent), ToolRegistry(directory)
        )
        session.directory = json.dumps(directory)
        session.state.active_stage = "faq" if seed else flow.start
        session.state.history = list(seed)
        events = []

        async def collect():
            async for event in session.events():
                events.append(event.wire())

        collector = asyncio.create_task(collect())
        try:
            for index, text in enumerate(turns):
                await session.submit_turn(text, f"evaluation-{index}")
                async with asyncio.timeout(30):
                    while session._tasks:
                        await asyncio.gather(*tuple(session._tasks))
                        await asyncio.sleep(0)
            errors = [e for e in events if e["type"] in {"error", "speech_error", "evaluation_error"}]
            result = {
                "case": name,
                "passed": not errors and check(session, events),
                "stage": session.state.active_stage,
                "facts": session.state.values(),
                "receipts": session.state.receipts,
                "events": events,
            }
            cases.append(result)
        finally:
            await session.close()
            await collector

    try:
        await run_session(
            "accepted_message_offer_and_corrected_contact",
            [
                Message("user", "Can I install custom equipment in Loft?", "seed"),
                Message(
                    "assistant",
                    "That information is not published. Would you like to leave a message for Sam Rivera in Support about the custom equipment?",
                    "seed",
                ),
            ],
            [
                "Yes, leave that message for Sam. Also ask about a discount for a 3 to 4 month booking.",
                "My name is Taylor Reed and my callback number is +1 202 555 0142.",
                "Actually, change my callback number to +1 202 555 0143.",
                "Yes, all those details are correct.",
            ],
            lambda s, e: (
                bool(s.state.receipts)
                and s.state.receipts[-1]["status"] == "captured"
                and s.state.receipts[-1]["data"]["callback_number"] == "+1 202 555 0143"
                and any(w in s.state.receipts[-1]["data"]["message"].lower() for w in ("equipment", "setup"))
                and "discount" in s.state.receipts[-1]["data"]["message"].lower()
                and sum(v["type"] == "readback" for v in e) >= 2
            ),
        )
        await run_session(
            "transfer_unavailable",
            [],
            ["I would like to speak to Maya in billing.", "Yes, connect me to Maya in billing."],
            lambda s, e: any(
                r["tool"] == "transfer_call" and r["status"] == "unavailable" for r in s.state.receipts
            ),
        )
    finally:
        await adapter.close()
    return {
        "kind": "live_text_workflow",
        "passed": all(c["passed"] for c in cases),
        "cases": cases,
        "measurement": "Real OpenRouter speaker/evaluator; simulated business tools. No TTS/playback benchmark.",
    }
