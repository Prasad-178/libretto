from fastapi.testclient import TestClient


def test_public_config_exposes_workflow_but_never_hosted_credentials(monkeypatch):
    from libretto.server import create_app

    monkeypatch.setenv("OPENROUTER_API_KEY", "PRIVATE-HOSTED-KEY")
    with TestClient(create_app()) as client:
        result = client.get("/api/config")
        assert result.status_code == 200
        assert result.json()["workflow"]["id"] == "northline-receptionist"
        assert "PRIVATE-HOSTED-KEY" not in result.text
        assert result.json()["call_limit_seconds"] == 300


def test_missing_key_yields_actionable_status_and_no_fake_response(monkeypatch):
    from libretto.server import create_app

    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with TestClient(create_app(load_environment=False)) as client:
        with client.websocket_connect("/api/ws") as ws:
            ws.send_json({"type": "start", "mode": "text"})
            packet = ws.receive_json()
            assert packet["type"] == "error"
            assert packet["data"]["code"] == "missing_openrouter_key"


def test_real_runtime_is_driven_through_one_websocket_with_injected_provider():
    from libretto.server import create_app
    from libretto.state import Evaluation

    class Model:
        async def evaluate(self, context):
            return Evaluation()

        async def stream_reply(self, context):
            yield "Support is closed on weekends."

        async def close(self):
            pass

    with TestClient(
        create_app(load_environment=False, model_factory=lambda *args, **kwargs: Model())
    ) as client:
        with client.websocket_connect("/api/ws") as ws:
            ws.send_json({"type": "start", "mode": "text", "openrouter_key": "visitor-test"})
            assert ws.receive_json()["type"] == "ready"
            ws.send_json({"type": "text", "text": "Is support open on weekends?", "turn_id": "t1"})
            packets = []
            while True:
                packet = ws.receive_json()
                packets.append(packet)
                if packet["type"] == "response_done":
                    break
            assert any(p["type"] == "retrieval" and p["data"]["passages"] for p in packets)
            assert any(p["type"] == "text_delta" and "weekends" in p["data"]["text"] for p in packets)
            assert "visitor-test" not in str(packets)
            ws.send_json({"type": "close"})


def test_yaml_source_route_returns_the_same_public_workflow():
    from libretto.server import create_app

    with TestClient(create_app(load_environment=False)) as client:
        response = client.get("/api/workflow.yaml")
        assert response.status_code == 200
        assert "northline-receptionist" in response.text
        assert "shared_prompt:" in response.text


def test_deployment_entrypoint_uses_explicit_asset_root(monkeypatch, tmp_path):
    import shutil
    from pathlib import Path

    from libretto.server import create_app

    source = Path(__file__).resolve().parents[1]
    shutil.copytree(source / "examples", tmp_path / "examples")
    (tmp_path / "public").mkdir()
    (tmp_path / "public/index.html").write_text("deployment frontend")
    monkeypatch.chdir("/")
    with TestClient(create_app(load_environment=False, asset_root=tmp_path)) as client:
        assert client.get("/").text == "deployment frontend"
        assert client.get("/api/config").status_code == 200


def test_frontend_route_survives_build_after_app_discovery(tmp_path):
    import shutil
    from pathlib import Path

    from libretto.server import create_app

    shutil.copytree(Path(__file__).resolve().parents[1] / "examples", tmp_path / "examples")
    app = create_app(load_environment=False, asset_root=tmp_path)
    (tmp_path / "public").mkdir()
    (tmp_path / "public/index.html").write_text("built after discovery")
    with TestClient(app) as client:
        assert client.get("/").text == "built after discovery"


def test_yaml_validation_and_session_use_edited_definition():
    from pathlib import Path

    from libretto.server import create_app
    from libretto.state import Evaluation

    source = (Path(__file__).resolve().parents[1] / "examples/minimal.yaml").read_text()
    seen = []

    class Model:
        async def evaluate(self, context):
            return Evaluation()

        async def stream_reply(self, context):
            seen.append(context.system)
            yield "Custom survey response."

        async def close(self):
            pass

    with TestClient(create_app(load_environment=False, model_factory=lambda *a, **kw: Model())) as client:
        valid = client.post("/api/workflow/validate", json={"source": source})
        assert valid.status_code == 200
        assert valid.json()["workflow"]["id"] == "tiny-survey"
        invalid = client.post("/api/workflow/validate", json={"source": "version: 9"})
        assert invalid.status_code == 422
        with client.websocket_connect("/api/ws") as ws:
            ws.send_json({"type": "start", "mode": "text", "openrouter_key": "test", "workflow_yaml": source})
            assert ws.receive_json()["data"]["workflow"]["id"] == "tiny-survey"
            ws.send_json({"type": "text", "text": "Hello", "turn_id": "edited"})
            while ws.receive_json()["type"] != "response_done":
                pass
            ws.send_json({"type": "close"})
        assert "what makes a useful demo" in seen[0].lower()


def test_edited_yaml_cannot_read_knowledge_outside_bundled_examples():
    from pathlib import Path

    from libretto.server import create_app

    source = (Path(__file__).resolve().parents[1] / "examples/receptionist.yaml").read_text()
    source = source.replace("company: knowledge", "company: ../../")
    with TestClient(create_app(load_environment=False)) as client:
        response = client.post("/api/workflow/validate", json={"source": source})
        assert response.status_code == 422


async def test_terminal_event_closes_socket_and_provider():
    import asyncio
    import json

    from libretto.server import create_app
    from libretto.state import Evaluation

    class Model:
        closed = False

        async def evaluate(self, context):
            return Evaluation(control="end_call")

        async def stream_reply(self, context):
            yield "Goodbye."

        async def close(self):
            self.closed = True

    class Socket:
        headers = {}

        def __init__(self):
            self.incoming = asyncio.Queue()
            for item in [
                {"type": "start", "mode": "text", "openrouter_key": "test"},
                {"type": "text", "text": "End call", "turn_id": "end"},
            ]:
                self.incoming.put_nowait({"type": "websocket.receive", "text": json.dumps(item)})
            self.sent = []

        async def accept(self):
            pass

        async def receive(self):
            return await self.incoming.get()

        async def send_json(self, data):
            self.sent.append(data)

        async def close(self, **kwargs):
            self.incoming.put_nowait({"type": "websocket.disconnect"})

    model, socket = Model(), Socket()
    app = create_app(load_environment=False, model_factory=lambda *a, **kw: model)
    handler = next(r.endpoint for r in app.routes if getattr(r, "path", "") == "/api/ws")
    async with app.router.lifespan_context(app):
        await asyncio.wait_for(handler(socket), 0.3)
    assert any(p["type"] == "ended" for p in socket.sent)
    assert model.closed


def test_voice_start_plays_literal_welcome_without_waiting_for_a_user_or_model():
    from libretto.providers.base import STTCapabilities, TTSCapabilities, TTSEvent
    from libretto.server import create_app
    from libretto.speech import SpeechRegistry

    class NoModel:
        async def evaluate(self, context):
            raise AssertionError("Welcome must not run the evaluator")

        async def stream_reply(self, context):
            raise AssertionError("Welcome must not run the speaker")
            yield ""

        async def close(self):
            pass

    class Recognition:
        capabilities = STTCapabilities()

        def __init__(self, *args, **kwargs):
            pass

        async def open(self):
            pass

        async def close(self):
            pass

    class Synthesis:
        capabilities = TTSCapabilities(streaming_text=True, cancellation=True)

        def __init__(self, credentials, config, emit, **kwargs):
            self.emit = emit

        async def open(self, **kwargs):
            pass

        async def close(self):
            pass

        async def interrupt(self, *args):
            pass

        async def cancel_output(self, *args):
            pass

        async def speak_text(self, text, epoch, message_id):
            await self.emit(TTSEvent("started", speech_id="welcome", epoch=epoch, message_id=message_id))
            await self.emit(TTSEvent("audio", speech_id="welcome", epoch=epoch, pcm=b"\x00\x00" * 480))

        async def finish_response(self):
            await self.emit(TTSEvent("finished", speech_id="welcome", epoch=0))

    registry = SpeechRegistry(
        stt={"deepgram": Recognition}, tts={"deepgram": Synthesis}, credentials={"deepgram": "openrouter"}
    )
    with TestClient(
        create_app(load_environment=False, model_factory=lambda *a, **kw: NoModel(), speech_registry=registry)
    ) as client:
        with client.websocket_connect("/api/ws") as ws:
            ws.send_json({"type": "start", "mode": "voice", "openrouter_key": "synthetic"})
            packets = []
            got_audio = False
            while True:
                frame = ws.receive()
                if frame.get("bytes"):
                    got_audio = True
                    continue
                import json

                packet = json.loads(frame["text"])
                packets.append(packet)
                assert packet["type"] not in {"error", "speech_error"}, packet
                if packet["type"] == "speech_finished":
                    break
            assert got_audio
            assert any(p["type"] == "response_done" and p["data"]["turn_id"] == "welcome" for p in packets)
            assert any(p["type"] == "first_audio" for p in packets)
            ws.send_json({"type": "close"})


def test_local_preview_port_is_allowed_but_foreign_origin_is_rejected():
    import pytest
    from starlette.websockets import WebSocketDisconnect

    from libretto.server import create_app

    with TestClient(create_app(load_environment=False), base_url="http://127.0.0.1:8001") as client:
        with client.websocket_connect(
            "ws://127.0.0.1:8001/api/ws", headers={"origin": "http://127.0.0.1:8001"}
        ) as ws:
            ws.send_json({"type": "start", "mode": "text"})
            assert ws.receive_json()["data"]["code"] == "missing_openrouter_key"
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(
                "ws://127.0.0.1:8001/api/ws", headers={"origin": "https://foreign.example"}
            ):
                pass
