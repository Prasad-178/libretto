import asyncio

from livekit import rtc
from livekit.agents import Agent, AgentSession, StopResponse, TurnHandlingOptions, stt, tts
from livekit.agents.voice import io


class Input(io.AudioInput):
    def __init__(self):
        super().__init__(label="probe-input")
        self.queue = asyncio.Queue()

    async def __anext__(self):
        return await self.queue.get()


class Output(io.AudioOutput):
    def __init__(self):
        super().__init__(
            label="probe-output", capabilities=io.AudioOutputCapabilities(pause=False), sample_rate=24000
        )
        self.captured = asyncio.Event()
        self.flushed = asyncio.Event()

    async def capture_frame(self, frame):
        await super().capture_frame(frame)
        self.captured.set()

    def flush(self):
        super().flush()
        self.flushed.set()

    def clear_buffer(self):
        self.on_playback_finished(playback_position=0, interrupted=True)


class FakeSTT(stt.STT):
    def __init__(self):
        super().__init__(capabilities=stt.STTCapabilities(streaming=True, interim_results=False))

    async def _recognize_impl(self, *args, **kwargs):
        raise AssertionError("No external inference")


class FakeTTS(tts.TTS):
    def __init__(self):
        super().__init__(capabilities=tts.TTSCapabilities(streaming=True), sample_rate=24000, num_channels=1)

    def synthesize(self, *args, **kwargs):
        raise AssertionError("No external inference")


class ProbeAgent(Agent):
    def __init__(self):
        super().__init__(instructions="Libretto owns replies")
        self.turns = []
        self.got_turn = asyncio.Event()

    async def stt_node(self, audio, model_settings):
        async for frame in audio:
            yield stt.SpeechEvent(type=stt.SpeechEventType.START_OF_SPEECH)
            yield stt.SpeechEvent(
                type=stt.SpeechEventType.FINAL_TRANSCRIPT,
                alternatives=[stt.SpeechData(language="en", text="book a visit")],
            )
            yield stt.SpeechEvent(type=stt.SpeechEventType.END_OF_SPEECH)

    async def on_user_turn_completed(self, turn_ctx, new_message):
        self.turns.append(new_message.text_content)
        self.got_turn.set()
        raise StopResponse()

    async def tts_node(self, text, model_settings):
        async for chunk in text:
            if chunk:
                yield rtc.AudioFrame(b"\0\0" * 240, 24000, 1, 240)

    async def llm_node(self, *args):
        raise AssertionError("Duplicate automatic reply")
        yield ""


async def main():
    input, output, agent = Input(), Output(), ProbeAgent()
    session = AgentSession(
        stt=FakeSTT(),
        tts=FakeTTS(),
        turn_handling=TurnHandlingOptions(
            turn_detection="stt",
            preemptive_generation={"enabled": False},
            interruption={"resume_false_interruption": False},
        ),
        user_away_timeout=None,
    )
    session.input.audio = input
    session.output.audio = output
    await session.start(agent=agent, record=False, session_host=False)
    try:
        input.queue.put_nowait(rtc.AudioFrame(b"\0\0" * 160, 16000, 1, 160))
        await asyncio.wait_for(agent.got_turn.wait(), 3)
        assert agent.turns == ["book a visit"]

        async def text():
            yield "Read"
            yield "back."

        handle = session.say(text())
        await asyncio.wait_for(output.flushed.wait(), 3)
        assert output.captured.is_set()
        assert not handle.done(), "Enqueue/flush must not finish verified playback"
        output.on_playback_finished(playback_position=0.01, interrupted=False)
        await asyncio.wait_for(handle.wait_for_playout(), 3)
        assert not handle.interrupted
        output.flushed.clear()
        second = session.say(text())
        await asyncio.wait_for(output.flushed.wait(), 3)
        second.interrupt()
        await asyncio.wait_for(second.wait_for_playout(), 3)
        assert second.interrupted
        print("PASS: finalized input, no automatic LLM, explicit output acknowledgement, interruption")
    finally:
        await session.aclose()


if __name__ == "__main__":
    asyncio.run(main())
