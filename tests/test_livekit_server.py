import json

from fastapi.testclient import TestClient

from libretto.server import create_app
from libretto.state import Evaluation


def test_bundled_default_voice_is_livekit_inference_without_deepgram_key():
    with TestClient(create_app(load_environment=False)) as client:
        config = client.get("/api/config").json()
        assert config["workflow"]["speech"]["engine"] == "livekit"
        assert config["workflow"]["speech"]["stt"]["provider"] == "assemblyai"
        choices = client.get("/api/studio/capabilities").json()["speechChoices"]
        assert any(choice["provider"] == "cartesia" and choice["engine"] == "livekit" for choice in choices)


def test_livekit_session_credentials_are_ephemeral_and_ack_reaches_voice_adapter(monkeypatch):
    from libretto.integrations.livekit import coordinator

    seen = []

    class Voice:
        def __init__(self, config, credentials, session, audio, control):
            self.credentials, self.session = credentials, session
            seen.append(self)
            self.acks = []

        async def open(self, **kwargs):
            pass

        async def close(self):
            pass

        async def configure(self, **kwargs):
            pass

        async def speak_text(self, *args):
            pass

        async def finish_response(self):
            pass

        async def interrupt(self, *args):
            pass

        async def cancel_output(self, *args):
            pass

        async def playback_finished(self, speech_id, *, epoch):
            self.acks.append((speech_id, epoch))

    class Model:
        async def evaluate(self, context):
            return Evaluation()

        async def stream_reply(self, context):
            yield "Hello"

        async def close(self):
            pass

    monkeypatch.setattr(coordinator, "LiveKitCoordinator", Voice)
    for name in ("LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "OPENROUTER_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    with TestClient(
        create_app(load_environment=False, model_factory=lambda *args, **kwargs: Model())
    ) as client:
        with client.websocket_connect("/api/ws") as ws:
            ws.send_json(
                {
                    "type": "start",
                    "mode": "voice",
                    "openrouter_key": "test-or",
                    "livekit_api_key": "test-lk",
                    "livekit_api_secret": "private-lk-secret",
                }
            )
            packet = ws.receive_json()
            assert packet["type"] == "ready", packet
            assert seen[0].credentials.key("livekit_api_secret") == "private-lk-secret"
            assert "private-lk-secret" not in json.dumps(packet)
            ws.send_json({"type": "playback", "speech_id": "test-output", "epoch": 0, "drained": True})
            ws.send_json({"type": "export"})
            while True:
                packet = ws.receive_json()
                assert "private-lk-secret" not in json.dumps(packet)
                if packet["type"] == "export":
                    break
            assert seen[0].acks == [("test-output", 0)]
            assert "private-lk-secret" not in client.get("/api/config").text
            ws.send_json({"type": "close"})
