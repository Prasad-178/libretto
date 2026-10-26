import json

from test_runtime import Evaluator, Search, Speaker


class Socket:
    def __init__(self):
        self.sent = []

    async def send(self, data):
        self.sent.append(data)

    async def close(self):
        pass


def adapter():
    from pathlib import Path

    from libretto.providers.base import SessionCredentials
    from libretto.providers.deepgram import DeepgramSpeechAdapter
    from libretto.runtime import Session
    from libretto.schema import load_workflow
    from libretto.tools import ToolRegistry

    controls, audio = [], []

    async def control(event):
        controls.append(event)

    async def binary(data):
        audio.append(data)

    session = Session(
        load_workflow(Path("examples/minimal.yaml")), Speaker(), Evaluator(), Search(), ToolRegistry()
    )
    speech = DeepgramSpeechAdapter(SessionCredentials(deepgram="test"), session, binary, control)
    speech.tts, speech.stt = Socket(), Socket()
    return speech, session, controls, audio


async def test_flux_eager_text_cannot_reach_tts_before_confirmed_turn():
    from test_runtime import next_event

    speech, session, controls, _ = adapter()
    try:
        await speech.handle_stt(
            {"type": "TurnInfo", "event": "EagerEndOfTurn", "turn_index": 1, "transcript": "Hello"}
        )
        await next_event(session, "draft_ready")
        assert not any(e.type == "text_delta" for e in session.trace)
        await speech.handle_stt(
            {
                "type": "TurnInfo",
                "event": "EndOfTurn",
                "turn_index": 1,
                "transcript": "Hello",
                "audio_window_end": 1.0,
            }
        )
        assert (await next_event(session, "text_delta")).data["text"]
        assert any(e["type"] == "transcript" for e in controls)
    finally:
        await session.close()


async def test_flux_tts_preserves_raw_deltas_and_flushes_only_on_response_end():
    speech, session, _, _ = adapter()
    await speech.speak_text("Hello ", 1)
    await speech.speak_text("Sam.", 1)
    await speech.finish_response()
    assert [json.loads(p) for p in speech.tts.sent] == [
        {"type": "Speak", "text": "Hello "},
        {"type": "Speak", "text": "Sam."},
        {"type": "Flush"},
    ]
    await session.close()


async def test_late_provider_audio_is_discarded_during_interrupt():
    speech, session, controls, audio = adapter()
    await speech.speak_text("Hello", 1)
    await speech.handle_tts({"type": "SpeechStarted", "speech_id": "old"})
    await speech.handle_tts(b"\x00\x00")
    assert len(audio) == 1
    await speech.interrupt(120.0)
    await speech.handle_tts(b"\x01\x00")
    assert len(audio) == 1
    await speech.handle_tts(
        {
            "type": "SpeechInterrupted",
            "audio_played_ms": 120,
            "metadata": {"speech_id": "old"},
            "text_spoken": "Hello",
        }
    )
    await speech.speak_text("New reply", 2)
    await speech.handle_tts({"type": "SpeechStarted", "speech_id": "new"})
    await speech.handle_tts(b"\x02\x00")
    assert len(audio) == 2
    await session.close()


async def test_patient_profile_is_sent_and_acknowledged():
    speech, session, controls, _ = adapter()
    await speech.configure(patient=True)
    config = json.loads(speech.stt.sent[-1])
    assert config["type"] == "Configure"
    assert config["thresholds"]["eot_timeout_ms"] == 8000
    await speech.handle_stt({"type": "ConfigureSuccess", **{k: v for k, v in config.items() if k != "type"}})
    assert controls[-1]["type"] == "stt_config_applied"
    await session.close()


async def test_resumed_turn_can_start_a_new_speculative_candidate():
    from test_runtime import next_event

    speech, session, _, _ = adapter()
    try:
        await speech.handle_stt(
            {"type": "TurnInfo", "event": "EagerEndOfTurn", "turn_index": 1, "transcript": "Hello"}
        )
        await next_event(session, "draft_ready")
        await speech.handle_stt(
            {"type": "TurnInfo", "event": "TurnResumed", "turn_index": 1, "transcript": "Hello"}
        )
        await speech.handle_stt(
            {"type": "TurnInfo", "event": "EagerEndOfTurn", "turn_index": 1, "transcript": "Hello again"}
        )
        assert session._current[0] == "Hello again"
    finally:
        await session.close()


async def test_failed_second_speech_connection_closes_the_first(monkeypatch):
    import pytest

    import libretto.providers.deepgram as module
    from libretto.providers.base import ProviderError

    speech, session, _, _ = adapter()

    class Partial(Socket):
        closed = False

        async def close(self):
            self.closed = True

    partial = Partial()

    async def connect(url, **kwargs):
        if "/listen?" in url:
            return partial
        raise RuntimeError("upstream failure")

    monkeypatch.setattr(module.websockets, "connect", connect)
    with pytest.raises(ProviderError):
        await speech.open()
    assert partial.closed
    await session.close()


async def test_informational_warning_does_not_acknowledge_interrupt():
    speech, session, _, _ = adapter()
    await speech.speak_text("Old reply", 1)
    await speech.handle_tts({"type": "SpeechStarted", "speech_id": "old"})
    await speech.interrupt(0)
    await speech.handle_tts({"type": "Warning", "code": "PRONUNCIATION_WARNINGS"})
    assert not speech._interrupt_ready.is_set()
    assert speech._speech_id == "old"
    await session.close()


async def test_ignored_interrupt_replaces_tts_connection_before_reuse(monkeypatch):
    speech, session, controls, audio = adapter()
    replacement = Socket()

    async def connect(*args, **kwargs):
        return replacement

    monkeypatch.setattr("libretto.providers.deepgram.websockets.connect", connect)
    await speech.speak_text("Old reply", 1)
    await speech.handle_tts({"type": "SpeechStarted", "speech_id": "old"})
    await speech.interrupt(0)
    await speech.handle_tts({"type": "Warning", "code": "NO_AUDIO_GENERATED"})
    assert speech.tts is replacement
    await speech.speak_text("New reply", 2)
    assert json.loads(replacement.sent[-1])["text"] == "New reply"
    await session.close()
    await speech.close()
