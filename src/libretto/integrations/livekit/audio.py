"""LiveKit custom IO preserves Studio's verified browser playback boundary."""

import asyncio
from dataclasses import dataclass, field
from uuid import uuid4

from livekit import rtc
from livekit.agents.voice import io

from libretto.events import pack_audio
from libretto.providers.base import ProviderError


@dataclass
class SpeechBinding:
    message_id: str
    epoch: int
    speech_id: str = field(default_factory=lambda: "lk-" + uuid4().hex)
    text: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=64))
    handle: object | None = None
    samples: int = 0
    started: bool = False
    flushed: bool = False
    interrupted: bool = False
    acknowledged: bool = False
    truncated: bool = False
    settled: bool = False
    aborted: asyncio.Event = field(default_factory=asyncio.Event)

    def abort(self) -> None:
        self.interrupted = True
        self.aborted.set()

    async def put(self, chunk: str | None) -> bool:
        """Backpressure must end when the SDK consumer is interrupted or closed."""
        if self.aborted.is_set():
            return False
        try:
            self.text.put_nowait(chunk)
            return True
        except asyncio.QueueFull:
            pass
        pending = asyncio.create_task(self.text.put(chunk))
        stopped = asyncio.create_task(self.aborted.wait())
        try:
            await asyncio.wait((pending, stopped), return_when=asyncio.FIRST_COMPLETED)
            return pending.done() and not self.aborted.is_set()
        finally:
            for task in (pending, stopped):
                if not task.done():
                    task.cancel()
            await asyncio.gather(pending, stopped, return_exceptions=True)

    async def chunks(self):
        while True:
            chunk = await self.text.get()
            if chunk is None:
                return
            yield chunk


class BrowserAudioInput(io.AudioInput):
    def __init__(self):
        super().__init__(label="libretto-browser-pcm")
        self.frames = asyncio.Queue(maxsize=128)

    async def __anext__(self):
        frame = await self.frames.get()
        if frame is None:
            raise StopAsyncIteration
        return frame

    def push(self, pcm: bytes) -> None:
        if not pcm or len(pcm) % 2:
            raise ProviderError("invalid_audio", "Expected mono PCM16 audio.")
        try:
            self.frames.put_nowait(rtc.AudioFrame(pcm, 16000, 1, len(pcm) // 2))
        except asyncio.QueueFull as error:
            raise ProviderError(
                "audio_input_overflow", "Audio input could not keep up; restart the voice test."
            ) from error

    def close(self) -> None:
        while not self.frames.empty():
            self.frames.get_nowait()
        self.frames.put_nowait(None)


class BrowserAudioOutput(io.AudioOutput):
    def __init__(self, bridge):
        super().__init__(
            label="libretto-verified-browser-output",
            capabilities=io.AudioOutputCapabilities(pause=False),
            sample_rate=24000,
        )
        self.bridge = bridge
        self.active: SpeechBinding | None = None

    async def capture_frame(self, frame: rtc.AudioFrame) -> None:
        handle = self.bridge.sdk.current_speech
        binding = self.bridge.handles.get(handle.id) if handle else None
        if not binding or binding.interrupted or binding.epoch != self.bridge.core.epoch:
            return
        if frame.sample_rate != 24000 or frame.num_channels != 1:
            raise ProviderError("invalid_audio_output", "Speech output must be mono PCM16 at 24 kHz.")
        await super().capture_frame(frame)
        self.active = binding
        if not binding.started:
            binding.started = True
            await self.bridge.control(
                {
                    "type": "speech_started",
                    "speech_id": binding.speech_id,
                    "message_id": binding.message_id,
                    "epoch": binding.epoch,
                    "sample_rate": 24000,
                }
            )
            await self.bridge.control(
                {
                    "type": "first_audio",
                    "speech_id": binding.speech_id,
                    "message_id": binding.message_id,
                    "epoch": binding.epoch,
                }
            )
        binding.samples += frame.samples_per_channel
        await self.bridge.send_audio(pack_audio(binding.epoch, binding.speech_id, bytes(frame.data)))

    def flush(self) -> None:
        super().flush()
        binding = self.active
        if binding and not binding.interrupted:
            binding.flushed = True
            self.bridge.spawn(
                self.bridge.control(
                    {
                        "type": "speech_finished",
                        "speech_id": binding.speech_id,
                        "message_id": binding.message_id,
                        "epoch": binding.epoch,
                    }
                )
            )
        # Only an explicit matching browser acknowledgement calls on_playback_finished.

    def _mark_input_truncated(self) -> None:
        # SDK1.8.10 invokes this before its failure-cleanup flush. Flush alone
        # cannot distinguish a complete utterance from a failed partial stream.
        super()._mark_input_truncated()
        handle = self.bridge.sdk.current_speech
        binding = self.bridge.handles.get(handle.id) if handle else self.active
        if binding:
            binding.truncated = True
            binding.abort()
            self._interrupt_binding(binding)

    def _interrupt_binding(self, binding: SpeechBinding) -> None:
        if binding.settled:
            return
        binding.abort()
        binding.settled = True
        self.bridge.core.reconcile_speech(binding.speech_id, "", interrupted=True)
        if binding is self.active:
            self.active = None
            self.on_playback_finished(playback_position=0, interrupted=True)
        self.bridge.spawn(
            self.bridge.control(
                {
                    "type": "speech_interrupted",
                    "speech_id": binding.speech_id,
                    "message_id": binding.message_id,
                    "epoch": binding.epoch,
                    "text_spoken": "",
                }
            )
        )

    def clear_buffer(self) -> None:
        binding = self.active
        if binding:
            self._interrupt_binding(binding)
