from pathlib import Path

import pytest

from libretto.providers import base
from libretto.schema import load_workflow


def test_independent_speech_contracts_are_public():
    assert all(
        hasattr(base, name)
        for name in (
            "STTProvider",
            "TTSProvider",
            "STTEvent",
            "TTSEvent",
            "STTCapabilities",
            "TTSCapabilities",
        )
    ), "Speech providers need independent contracts and normalized events"


def test_speech_configuration_is_independent_and_bounded():
    from libretto.schema import parse_workflow

    flow = load_workflow(Path("examples/minimal.yaml"))
    assert hasattr(flow, "speech"), "Workflow needs independent speech provider configuration"
    assert flow.speech.stt.provider == "deepgram"
    assert flow.speech.tts.provider == "deepgram"
    source = Path("examples/minimal.yaml").read_text()
    changed = parse_workflow(
        source
        + "\nspeech:\n  stt: {provider: other-stt, model: small-en}\n  tts: {provider: other-tts, model: voice-en}\n  hints: [Libretto]\n"
    )
    assert changed.speech.stt.provider != changed.speech.tts.provider
    with pytest.raises(ValueError):
        parse_workflow(source + "\nspeech: {hints: [" + "a" * 101 + "]}\n")


async def test_mixed_providers_normalize_events_without_a_vendor_session():
    assert hasattr(base, "STTEvent"), "Normalized STT events are missing"
    from test_runtime import Evaluator, Search, Speaker, next_event

    from libretto.runtime import Session
    from libretto.speech import SpeechCoordinator
    from libretto.tools import ToolRegistry

    controls, audio = [], []

    async def control(event):
        controls.append(event)

    async def binary(data):
        audio.append(data)

    class Recognition:
        capabilities = base.STTCapabilities(eager_turns=False, patient_profiles=False, force_end=False)

        async def open(self):
            pass

        async def close(self):
            pass

        async def send_input(self, pcm):
            self.input = pcm

    class Synthesis:
        capabilities = base.TTSCapabilities(streaming_text=True, cancellation=True, spoken_prefix=False)

        async def open(self, *, playback_ms=0):
            pass

        async def close(self):
            pass

        async def speak_text(self, text, epoch, message_id=""):
            pass

        async def finish_response(self):
            pass

        async def interrupt(self, playback_ms=None):
            pass

        async def cancel_output(self, playback_ms=0):
            pass

    stt, tts = Recognition(), Synthesis()
    session = Session(
        load_workflow(Path("examples/minimal.yaml")), Speaker(), Evaluator(), Search(), ToolRegistry()
    )
    speech = SpeechCoordinator(session, stt, tts, binary, control)
    try:
        await speech.open()
        await speech.configure(patient=True)  # Unsupported capability must not be called.
        await speech.force_end()
        await speech.send_input(b"\x00\x00")
        assert stt.input == b"\x00\x00"
        await speech.handle_stt(base.STTEvent("eager", text="Ignored", turn_id="1"))
        assert session._current is None
        await speech.handle_stt(base.STTEvent("final", text="Hello", turn_id="1"))
        delta = await next_event(session, "text_delta")
        message_id = delta.data["message_id"]
        await speech.handle_tts(
            base.TTSEvent("started", speech_id="s1", epoch=session.epoch, message_id=message_id)
        )
        await speech.handle_tts(base.TTSEvent("audio", speech_id="s1", epoch=session.epoch, pcm=b"\x00\x00"))
        assert len(audio) == 1
        await speech.handle_tts(
            base.TTSEvent("interrupted", speech_id="s1", message_id=message_id, text_spoken="Untrusted")
        )
        assert controls[-1]["text_spoken"] == ""  # No alignment guarantee means no claimed prefix.
        assert controls[0]["type"] == "speech_capabilities"
    finally:
        await session.close()
        await speech.close()


def test_server_accepts_an_allowlisted_speech_registry():
    import inspect

    from libretto.server import create_app

    assert "speech_registry" in inspect.signature(create_app).parameters


def test_unknown_speech_provider_and_incompatible_model_fail_validation():
    from fastapi.testclient import TestClient

    from libretto.server import create_app

    source = Path("examples/receptionist.yaml").read_text()
    with TestClient(create_app(load_environment=False)) as client:
        unknown = client.post(
            "/api/workflow/validate",
            json={"source": source.replace("provider: deepgram", "provider: unregistered", 1)},
        )
        assert unknown.status_code == 422
        assert "Unsupported STT provider" in unknown.text
        incompatible = client.post(
            "/api/workflow/validate",
            json={"source": source.replace("model: flux-general-en", "model: incompatible-model")},
        )
        assert incompatible.status_code == 422, "Models must match the adapter's declared capabilities"


def test_mixed_speech_registry_runs_voice_and_rekeys_without_deepgram(monkeypatch):
    from fastapi.testclient import TestClient

    from libretto.server import create_app
    from libretto.speech import SpeechRegistry
    from libretto.state import Evaluation

    monkeypatch.delenv("DEEPGRAM_API_KEY", raising=False)
    activity = []

    class Model:
        async def evaluate(self, context):
            return Evaluation()

        async def stream_reply(self, context):
            yield "Independent reply."

        async def close(self):
            pass

    class Recognition:
        capabilities = base.STTCapabilities(patient_profiles=True)

        def __init__(self, credentials, config, emit, *, hints):
            self.emit, self.key = emit, credentials.key("openrouter")

        async def open(self):
            activity.append(("stt_open", self.key))

        async def close(self):
            activity.append(("stt_close", self.key))

        async def configure(self, *, patient):
            activity.append(("stt_configure", self.key, patient))

        async def send_input(self, pcm):
            await self.emit(base.STTEvent("final", text="Hello", turn_id="audio-1"))

    class Synthesis:
        capabilities = base.TTSCapabilities(streaming_text=True, cancellation=True)

        def __init__(self, credentials, config, emit, *, hints):
            self.emit, self.key = emit, credentials.key("openrouter")

        async def open(self, *, playback_ms=0):
            activity.append(("tts_open", self.key, playback_ms))

        async def close(self):
            activity.append(("tts_close", self.key))

        async def speak_text(self, text, epoch, message_id=""):
            self.epoch = epoch
            await self.emit(
                base.TTSEvent("started", speech_id="utterance-1", epoch=epoch, message_id=message_id)
            )
            await self.emit(base.TTSEvent("audio", speech_id="utterance-1", epoch=epoch, pcm=b"\x00\x00"))

        async def finish_response(self):
            await self.emit(base.TTSEvent("finished", speech_id="utterance-1", epoch=self.epoch))

        async def interrupt(self, playback_ms=None):
            pass

        async def cancel_output(self, playback_ms=0):
            pass

    registry = SpeechRegistry(
        stt={"alternate-stt": Recognition},
        tts={"alternate-tts": Synthesis},
        credentials={"alternate-stt": "openrouter", "alternate-tts": "openrouter"},
    )
    source = (
        Path("examples/minimal.yaml")
        .read_text()
        .replace("kind: conversation", "kind: conversation\n    patient: true")
        + "\nspeech:\n  stt: {provider: alternate-stt, model: recognition}\n  tts: {provider: alternate-tts, model: synthesis}\n"
    )
    app = create_app(load_environment=False, model_factory=lambda *a, **kw: Model(), speech_registry=registry)
    with TestClient(app) as client:
        with client.websocket_connect("/api/ws") as ws:
            ws.send_json(
                {"type": "start", "mode": "voice", "workflow_yaml": source, "openrouter_key": "first"}
            )
            packets = []
            while True:
                packet = ws.receive_json()
                packets.append(packet)
                if packet["type"] == "ready":
                    break
                assert packet["type"] != "error", packet
            assert any(p["type"] == "speech_capabilities" for p in packets)
            ws.send_bytes(b"\x00\x00")
            received_audio = False
            while True:
                frame = ws.receive()
                if frame.get("bytes"):
                    received_audio = True
                    continue
                import json

                packet = json.loads(frame["text"])
                if packet["type"] == "speech_finished":
                    epoch = packet["data"]["epoch"]
                    break
            assert received_audio
            ws.send_json(
                {
                    "type": "playback",
                    "epoch": epoch,
                    "playback_ms": 120,
                    "drained": True,
                    "speech_id": "utterance-1",
                }
            )
            ws.send_json({"type": "credentials", "openrouter_key": "second"})
            while ws.receive_json()["type"] != "credentials_updated":
                pass
            assert ("stt_configure", "second", True) in activity
            assert ("tts_open", "second", 120) in activity
            assert ("stt_close", "first") in activity
            assert ("tts_close", "first") in activity
            ws.send_json({"type": "close"})
    assert ("stt_close", "second") in activity
    assert ("tts_close", "second") in activity
