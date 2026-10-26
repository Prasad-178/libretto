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
