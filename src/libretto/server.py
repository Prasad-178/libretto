"""The WebSocket owns the session; no instance-affinity assumptions across requests."""

import asyncio
import json
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import PlainTextResponse
from pydantic import Field, SecretStr, ValidationError

from libretto.providers.base import ProviderError, SessionCredentials
from libretto.providers.openrouter import OpenRouterAdapter
from libretto.retrieval import build_index
from libretto.runtime import Session
from libretto.schema import Models, StrictModel, load_workflow, parse_workflow
from libretto.speech import default_speech_registry
from libretto.tools import ToolRegistry

ROOT = Path(__file__).resolve().parents[2]
START_TIMEOUT_SECONDS = 15


class RequestBudget:
    """Per-connection token bucket, not a distributed/IP-level rate limiter."""

    def __init__(self, *, rate: float = 1, burst: float = 3):
        self.rate, self.burst, self.tokens, self.last = rate, burst, burst, None

    def accept(self, now: float) -> bool:
        if self.last is not None:
            self.tokens = min(self.burst, self.tokens + max(0, now - self.last) * self.rate)
        self.last = now
        if self.tokens < 1:
            return False
        self.tokens -= 1
        return True


class ClientEvent(StrictModel):
    type: Literal["start", "text", "interrupt", "force_end", "playback", "credentials", "close", "export"]
    mode: Literal["text", "voice"] = "text"
    text: str = Field(default="", max_length=8000)
    turn_id: str = Field(default="", max_length=100)
    openrouter_key: SecretStr = Field(default_factory=lambda: SecretStr(""), repr=False)
    deepgram_key: SecretStr = Field(default_factory=lambda: SecretStr(""), repr=False)
    transfer_outcome: Literal["connected", "unavailable", "failed", "timeout"] = "unavailable"
    playback_ms: float = Field(default=0, ge=0, le=200_000)
    drained: bool = False
    epoch: int = 0
    speech_id: str = Field(default="", max_length=100)
    speaker_model: str = Field(default="", max_length=100)
    evaluator_model: str = Field(default="", max_length=100)
    workflow_yaml: str = Field(default="", max_length=100_000)


class WorkflowSource(StrictModel):
    source: str = Field(max_length=100_000)


def create_app(
    *,
    load_environment: bool = True,
    model_factory=OpenRouterAdapter,
    asset_root: Path | None = None,
    speech_registry=None,
) -> FastAPI:
    registry = speech_registry or default_speech_registry()
    root = asset_root or ROOT
    if load_environment:
        load_dotenv(root / ".env")
    workflow = load_workflow(root / "examples/receptionist.yaml")
    index = build_index(workflow, root / "examples")
    directory = json.loads((root / "examples/directory.json").read_text())
    ToolRegistry(directory).validate(workflow)

    def compile_source(source: str):
        definition = parse_workflow(source)
        registry.validate(definition.speech)
        # Visitor edits select only bundled documents and registered simulations.
        if any(path not in workflow.knowledge.values() for path in definition.knowledge.values()):
            raise ValueError("Knowledge must use a bundled document directory")
        ToolRegistry(directory).validate(definition)
        return definition, build_index(definition, root / "examples")

    @asynccontextmanager
    async def lifespan(app):
        app.state.pool = httpx.AsyncClient(
            timeout=httpx.Timeout(20, connect=8),
            limits=httpx.Limits(max_connections=24, max_keepalive_connections=12),
        )
        yield
        await app.state.pool.aclose()

    app = FastAPI(title="Libretto", lifespan=lifespan)

    def hosted_enabled():
        setting = os.getenv("LIBRETTO_ALLOW_HOSTED_KEYS")
        return setting.lower() in {"true", "1"} if setting is not None else not bool(os.getenv("VERCEL"))

    def hosted():
        if not hosted_enabled():
            return SessionCredentials()
        return SessionCredentials(
            openrouter=os.getenv("OPENROUTER_API_KEY", ""), deepgram=os.getenv("DEEPGRAM_API_KEY", "")
        )

    @app.get("/api/health")
    async def health():
        return {"status": "ok", "version": "0.1.0"}

    @app.get("/api/workflow.yaml", response_class=PlainTextResponse)
    async def yaml_source():
        return (root / "examples/receptionist.yaml").read_text()

    @app.get("/api/config")
    async def config():
        return {
            "workflow": workflow.model_dump(),
            "call_limit_seconds": 180,
            "credentials": hosted().public_status(),
            "credential_mode": "hosted" if hosted_enabled() else "visitor",
            "directory": directory,
            "knowledge_documents": [
                {"document": p.document, "heading": p.heading, "text": p.text} for p in index.passages
            ],
        }

    @app.post("/api/workflow/validate")
    async def validate_source(body: WorkflowSource):
        try:
            definition, _ = compile_source(body.source)
            return {"workflow": definition.model_dump()}
        except (ValueError, TypeError, OSError) as exc:
            if isinstance(exc, ValidationError):
                issues = [{"path": ".".join(map(str, e["loc"])), "message": e["msg"]} for e in exc.errors()]
            else:
                issues = [{"path": "source", "message": str(exc)[:500]}]
            raise HTTPException(status_code=422, detail=issues) from None

    @app.websocket("/api/ws")
    async def conversation(ws: WebSocket):
        origin = ws.headers.get("origin")
        allowed = {
            "http://localhost:5173",
            "http://localhost:8000",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:8000",
            "https://libretto.prasadjs.me",
            "https://" + ws.headers.get("host", ""),
        }
        if origin and origin not in allowed:
            await ws.close(code=1008)
            return
        await ws.accept()
        send_lock = asyncio.Lock()
        session = adapter = speech = credentials = None
        background: list[asyncio.Task] = []
        started_at = None
        last_playback = 0.0
        session_workflow = workflow
        start_deadline = time.monotonic() + START_TIMEOUT_SECONDS
        costly_events = RequestBudget()
        frames = RequestBudget(rate=64, burst=128)

        async def control(kind, **data):
            async with send_lock:
                await ws.send_json(
                    {
                        "type": kind,
                        "epoch": session.epoch if session else 0,
                        "data": data,
                        "at": time.monotonic() - started_at if started_at else 0,
                    }
                )

        async def audio(data):
            async with send_lock:
                await ws.send_bytes(data)

        async def speech_control(packet):
            kind = packet.pop("type")
            await control(kind, **packet)

        async def pump():
            async for event in session.events():
                async with send_lock:
                    await ws.send_json(event.wire())
                if speech:
                    try:
                        if event.type == "text_delta" and event.epoch == session.epoch:
                            await speech.speak_text(
                                event.data["text"], event.epoch, event.data.get("message_id", "")
                            )
                        elif event.type == "response_done" and event.epoch == session.epoch:
                            await speech.finish_response()
                        elif event.type == "interrupted" and event.epoch == session.epoch:
                            await speech.interrupt(last_playback)
                        elif event.type == "state":
                            node = session_workflow.nodes[session.state.active_stage]
                            await speech.configure(patient=node.patient)
                    except ProviderError as exc:
                        await control("error", code=exc.code, message=exc.public_message)
                if event.type == "response_done" and getattr(adapter, "usage", None):
                    await control("usage", requests=list(adapter.usage))
                if event.type in {"ended", "expired"}:
                    await session.close()
                    if speech:
                        await speech.close()
                    await adapter.close()
                    credentials.clear()
                    await ws.close(code=1000)
                    return

        async def expire():
            await asyncio.sleep(max(0, 180 - (time.monotonic() - started_at)))
            await control(
                "expired", message="Three-minute demo complete. Start a fresh conversation to continue."
            )
            await session.close()
            await ws.close(code=1000)

        try:
            while True:
                try:
                    if session is None:
                        async with asyncio.timeout(max(0, start_deadline - time.monotonic())):
                            frame = await ws.receive()
                    else:
                        frame = await ws.receive()
                except TimeoutError:
                    await control(
                        "error", code="start_timeout", message="Start timed out. Reconnect to try again."
                    )
                    await ws.close(code=1008)
                    break
                if frame["type"] == "websocket.disconnect":
                    break
                if not frames.accept(time.monotonic()):
                    await control(
                        "error", code="rate_limited", message="Too many events. Reconnect and try again."
                    )
                    await ws.close(code=1008)
                    break
                if frame.get("bytes") is not None:
                    if len(frame["bytes"]) > 8192:
                        await control("error", code="message_limit", message="Audio frame is too large.")
                        await ws.close(code=1009)
                        break
                    if speech:
                        await speech.send_input(frame["bytes"])
                    continue
                raw = frame.get("text", "")
                if len(raw.encode()) > 128_000:
                    await control("error", code="message_limit", message="Message is too large.")
                    await ws.close(code=1009)
                    break
                try:
                    event = ClientEvent.model_validate_json(raw)
                except ValidationError:
                    await control("error", code="invalid_event", message="The client sent an invalid event.")
                    continue
                if event.type == "close":
                    break
                if event.type in {"start", "text", "credentials"} and not costly_events.accept(
                    time.monotonic()
                ):
                    await control(
                        "error", code="rate_limited", message="Please wait a second before another request."
                    )
                    continue
                if event.type == "start":
                    if session:
                        await control(
                            "error",
                            code="already_started",
                            message="Start a new connection for a fresh session.",
                        )
                        continue
                    try:
                        session_workflow, session_index = (
                            compile_source(event.workflow_yaml) if event.workflow_yaml else (workflow, index)
                        )
                    except (ValueError, TypeError, OSError):
                        await control(
                            "error",
                            code="invalid_workflow",
                            message="The YAML workflow is invalid. Validate your changes before testing.",
                        )
                        continue
                    credentials = hosted().with_overrides(
                        openrouter=event.openrouter_key.get_secret_value(),
                        deepgram=event.deepgram_key.get_secret_value(),
                    )
                    if not credentials.key("openrouter"):
                        await control(
                            "error",
                            code="missing_openrouter_key",
                            message="Add an OpenRouter key in Connection settings.",
                        )
                        continue
                    if event.mode == "voice":
                        missing = [
                            name
                            for name in sorted(registry.required_credentials(session_workflow.speech))
                            if not credentials.key(name)
                        ]
                        if missing:
                            await control(
                                "error",
                                code=f"missing_{missing[0]}_key",
                                message=f"Add a {missing[0]} key for the selected speech providers, or start text mode.",
                            )
                            continue
                    models = Models(
                        speaker=event.speaker_model or session_workflow.models.speaker,
                        evaluator=event.evaluator_model or session_workflow.models.evaluator,
                    )
                    adapter = model_factory(credentials, models, client=app.state.pool)
                    session = Session(
                        session_workflow, adapter, adapter, session_index, ToolRegistry(directory)
                    )
                    session.directory = json.dumps(directory)
                    session.state.transfer_outcome = event.transfer_outcome
                    session.defer_actions = event.mode == "voice"
                    started_at = time.monotonic()
                    if event.mode == "voice":
                        speech = registry.create(
                            session_workflow.speech, credentials, session, audio, speech_control
                        )
                        session.cancel_output = lambda: speech.cancel_output(last_playback)
                        try:
                            await speech.open()
                        except ProviderError as exc:
                            await control("error", code=exc.code, message=exc.public_message)
                            await session.close()
                            await speech.close()
                            await adapter.close()
                            credentials.clear()
                            adapter = credentials = None
                            session = speech = None
                            continue
                    await control(
                        "ready",
                        mode=event.mode,
                        credentials=credentials.public_status(),
                        call_limit_seconds=180,
                        models=models.model_dump(),
                        workflow=session_workflow.model_dump(),
                    )
                    await session.publish_state()
                    background.extend([asyncio.create_task(pump()), asyncio.create_task(expire())])
                elif session and not session.closed:
                    if event.type == "text":
                        await session.submit_turn(event.text, event.turn_id or str(time.monotonic_ns()))
                    elif event.type == "interrupt":
                        last_playback = event.playback_ms
                        await session.interrupt()
                    elif event.type == "force_end" and speech:
                        await speech.force_end()
                    elif event.type == "playback" and event.epoch == session.epoch:
                        last_playback = max(last_playback, event.playback_ms)
                        await session.emit("playback", playback_ms=last_playback, drained=event.drained)
                        if event.drained:
                            session.playback_finished(event.speech_id)
                    elif event.type == "credentials":
                        await session.interrupt()
                        replacement = credentials.with_overrides(
                            openrouter=event.openrouter_key.get_secret_value(),
                            deepgram=event.deepgram_key.get_secret_value(),
                        )
                        credentials.clear()
                        credentials = replacement
                        adapter.credentials = replacement
                        if speech:
                            await speech.close()
                            speech = registry.create(
                                session_workflow.speech, replacement, session, audio, speech_control
                            )
                            await speech.open(playback_ms=last_playback)
                            await speech.configure(
                                patient=session_workflow.nodes[session.state.active_stage].patient
                            )
                        await control("credentials_updated", credentials=replacement.public_status())
                    elif event.type == "export":
                        await control(
                            "export",
                            events=[e.wire() for e in session.trace],
                            messages=[{"role": m.role, "content": m.content} for m in session.state.history],
                            receipts=session.state.receipts,
                        )
        except WebSocketDisconnect:
            pass
        except Exception:
            try:
                await control(
                    "error", code="connection_error", message="Connection ended. Start a fresh session."
                )
            except Exception:
                pass
        finally:
            if session:
                await session.close()
            for task in background:
                task.cancel()
            await asyncio.gather(*background, return_exceptions=True)
            if speech:
                await speech.close()
            if adapter:
                await adapter.close()
            if credentials:
                credentials.clear()

    app.frontend("/", directory=root / "public", fallback="index.html", check_dir=False)

    return app
