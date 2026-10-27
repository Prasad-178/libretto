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
    from libretto.providers.deepgram import DeepgramSTT, DeepgramTTS
    from libretto.runtime import Session
    from libretto.schema import Speech, load_workflow
    from libretto.speech import SpeechCoordinator
    from libretto.tools import ToolRegistry

    controls, audio = [], []

    async def control(event):
        controls.append(event)

    async def binary(data):
        audio.append(data)

    session = Session(
        load_workflow(Path("examples/minimal.yaml")), Speaker(), Evaluator(), Search(), ToolRegistry()
    )
    credentials, config = SessionCredentials(deepgram="test"), Speech()

    async def stt_sink(event):
        await speech.handle_stt(event)

    async def tts_sink(event):
        await speech.handle_tts(event)

    stt = DeepgramSTT(credentials, config.stt, stt_sink)
    tts = DeepgramTTS(credentials, config.tts, tts_sink)
    speech = SpeechCoordinator(session, stt, tts, binary, control)
    stt.socket, tts.tts = Socket(), Socket()
    return speech, session, controls, audio


async def test_flux_eager_text_cannot_reach_tts_before_confirmed_turn():
    from test_runtime import next_event

    speech, session, controls, _ = adapter()
    try:
        await speech.stt.handle_packet(
            {"type": "TurnInfo", "event": "EagerEndOfTurn", "turn_index": 1, "transcript": "Hello"}
        )
        await next_event(session, "draft_ready")
        assert not any(e.type == "text_delta" for e in session.trace)
        await speech.stt.handle_packet(
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
    assert [json.loads(p) for p in speech.tts.tts.sent] == [
        {"type": "Speak", "text": "Hello "},
        {"type": "Speak", "text": "Sam."},
        {"type": "Flush"},
    ]
    await session.close()


async def test_late_provider_audio_is_discarded_during_interrupt():
    speech, session, controls, audio = adapter()
    session.epoch = 1
    await speech.speak_text("Hello", 1)
    await speech.tts.handle_packet({"type": "SpeechStarted", "speech_id": "old"})
    await speech.tts.handle_packet(b"\x00\x00")
    assert len(audio) == 1
    await speech.interrupt(120.0)
    await speech.tts.handle_packet(b"\x01\x00")
    assert len(audio) == 1
    await speech.tts.handle_packet(
        {
            "type": "SpeechInterrupted",
            "audio_played_ms": 120,
            "metadata": {"speech_id": "old"},
            "text_spoken": "Hello",
        }
    )
    session.epoch = 2
    await speech.speak_text("New reply", 2)
    await speech.tts.handle_packet({"type": "SpeechStarted", "speech_id": "new"})
    await speech.tts.handle_packet(b"\x02\x00")
    assert len(audio) == 2
    await session.close()


async def test_patient_profile_is_sent_and_acknowledged():
    speech, session, controls, _ = adapter()
    await speech.configure(patient=True)
    config = json.loads(speech.stt.socket.sent[-1])
    assert config["type"] == "Configure"
    assert config["thresholds"]["eot_timeout_ms"] == 8000
    await speech.stt.handle_packet(
        {"type": "ConfigureSuccess", **{k: v for k, v in config.items() if k != "type"}}
    )
    assert controls[-1]["type"] == "stt_config_applied"
    await session.close()


async def test_resumed_turn_can_start_a_new_speculative_candidate():
    from test_runtime import next_event

    speech, session, _, _ = adapter()
    try:
        await speech.stt.handle_packet(
            {"type": "TurnInfo", "event": "EagerEndOfTurn", "turn_index": 1, "transcript": "Hello"}
        )
        await next_event(session, "draft_ready")
        await speech.stt.handle_packet(
            {"type": "TurnInfo", "event": "TurnResumed", "turn_index": 1, "transcript": "Hello"}
        )
        await speech.stt.handle_packet(
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
    await speech.tts.handle_packet({"type": "SpeechStarted", "speech_id": "old"})
    await speech.interrupt(0)
    await speech.tts.handle_packet({"type": "Warning", "code": "PRONUNCIATION_WARNINGS"})
    assert not speech.tts._interrupt_ready.is_set()
    assert speech.tts._speech_id == "old"
    await session.close()


async def test_ignored_interrupt_replaces_tts_connection_before_reuse(monkeypatch):
    speech, session, controls, audio = adapter()
    replacement = Socket()

    async def connect(*args, **kwargs):
        return replacement

    monkeypatch.setattr("libretto.providers.deepgram.websockets.connect", connect)
    await speech.speak_text("Old reply", 1)
    await speech.tts.handle_packet({"type": "SpeechStarted", "speech_id": "old"})
    await speech.interrupt(0)
    await speech.tts.handle_packet({"type": "Warning", "code": "NO_AUDIO_GENERATED"})
    assert speech.tts.tts is replacement
    session.epoch = 2
    await speech.speak_text("New reply", 2)
    assert json.loads(replacement.sent[-1])["text"] == "New reply"
    await session.close()
    await speech.close()


async def test_interrupt_uses_integer_session_milliseconds_after_reconnection():
    # Flux rejects fractional numbers with fatal MESSAGE-0000, even though browser
    # PCM playback naturally reports fractions of milliseconds.
    speech, session, _, _ = adapter()
    speech.tts._playback_base = 1000.25
    await speech.speak_text("A reply", 1)
    await speech.tts.handle_packet({"type": "SpeechStarted", "speech_id": "one"})
    await speech.interrupt(1120.583333)
    packet = json.loads(speech.tts.tts.sent[-1])
    assert packet["playback_offset"] == {"type": "time_ms", "value": 120}
    assert type(packet["playback_offset"]["value"]) is int
    await session.close()
