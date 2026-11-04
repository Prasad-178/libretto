"""Deterministic inference/side-effect boundaries; the production Session remains real."""
import asyncio
from collections import deque
from copy import deepcopy


class ScriptedResponder:
    def __init__(self, replies):
        self.replies = deque(replies)
        self.contexts = []

    async def stream_reply(self, context):
        self.contexts.append(context)
        if not self.replies:
            raise AssertionError("Unexpected response request")
        yield self.replies.popleft()


class ScriptedEvaluator:
    def __init__(self, evaluations, *, blocked=False):
        self.evaluations = deque(evaluations)
        self.started, self.release = asyncio.Event(), asyncio.Event()
        self.contexts = []
        if not blocked:
            self.release.set()

    async def evaluate(self, context):
        self.contexts.append(context)
        self.started.set()
        await self.release.wait()
        if not self.evaluations:
            raise AssertionError("Unexpected evaluation request")
        return self.evaluations.popleft()


class RecordingToolHandler:
    def __init__(self, result, *, blocked=False):
        self.result, self.calls = result, []
        self.started, self.release = asyncio.Event(), asyncio.Event()
        if not blocked:
            self.release.set()

    async def __call__(self, arguments, context):
        self.calls.append((deepcopy(arguments), context))
        self.started.set()
        await self.release.wait()
        return self.result.model_copy(deep=True)


async def drain_until(session, event_type, *, limit=200, timeout=1):
    observed = []
    try:
        async with asyncio.timeout(timeout):
            async for event in session.events():
                observed.append(event.type)
                if event.type == event_type:
                    return event
                if len(observed) >= limit:
                    break
    except TimeoutError as error:
        raise AssertionError(f"Timed out waiting for {event_type}; observed {observed}") from error
    raise AssertionError(f"Missing {event_type}; observed {observed}")
