"""Separate Deepgram transports. Runtime orchestration lives in libretto.speech."""

import asyncio
import json
import uuid
from collections import deque
from urllib.parse import urlencode

import websockets

from libretto.providers.base import (
    ProviderError,
    SessionCredentials,
    STTCapabilities,
    STTEvent,
    TTSCapabilities,
    TTSEvent,
)
from libretto.providers.openrouter import check_status


class _Transport:
    def __init__(self, credentials: SessionCredentials, config, emit, *, hints=()):
        self.credentials, self.config, self.emit = credentials, config, emit
        self.hints = list(hints)
        self.tasks = []

    def settings(self):
        key = self.credentials.key("deepgram")
        if not key:
            raise ProviderError("missing_deepgram_key", "Add a Deepgram key to enable live voice.")
        return dict(
            additional_headers={"Authorization": f"Token {key}"},
            ping_interval=20,
            ping_timeout=20,
            open_timeout=8,
            close_timeout=1,
            max_queue=16,
        )

    async def connect(self, url, settings):
        try:
            return await websockets.connect(url, **settings)
        except Exception as exc:
            status = getattr(getattr(exc, "response", None), "status_code", 503)
            check_status(status)
            raise ProviderError("speech_connection_failed", "Could not connect to live speech.") from exc

    async def status(self, **data):
        event = STTEvent if isinstance(self, DeepgramSTT) else TTSEvent
        await self.emit(event("status", data=data))

    async def _receive(self, socket, handler):
        try:
            async for packet in socket:
                await handler(json.loads(packet) if isinstance(packet, str) else packet)
        except asyncio.CancelledError:
            raise
        except Exception:
            await self.status(
                type="speech_error", message="The speech connection stopped. Reconnect or continue in text."
            )

    async def close(self):
        tasks = [t for t in self.tasks if t is not asyncio.current_task()]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        socket = getattr(self, "socket", None)
        if socket:
            await socket.close()
        self.socket = None
        self.tasks.clear()


class DeepgramSTT(_Transport):
    supported_models = frozenset({"flux-general-en"})
    capabilities = STTCapabilities(eager_turns=True, patient_profiles=True, force_end=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.socket = None
        self._patient = None
        self._prefix = "voice-" + uuid.uuid4().hex[:8]

    async def open(self):
        listen = urlencode(
            dict(
                model=self.config.model,
                encoding="linear16",
                sample_rate=16000,
                eot_threshold=0.75,
                eager_eot_threshold=0.5,
                eot_timeout_ms=5000,
            )
        )
        self.socket = await self.connect("wss://api.deepgram.com/v2/listen?" + listen, self.settings())
        self._patient = None
        self.tasks.append(asyncio.create_task(self._receive(self.socket, self.handle_packet)))
        await self.configure(patient=False)

    async def handle_packet(self, packet):
        if packet.get("type") == "ConfigureSuccess":
            await self.status(type="stt_config_applied", settings=packet)
        elif packet.get("type") in {"ConfigureFailure", "Warning", "Error"}:
            await self.status(
                type="stt_status",
                code=packet.get("code"),
                message="Speech configuration/provider event; see code.",
            )
        elif packet.get("type") == "TurnInfo":
            kind = {
                "StartOfTurn": "started",
                "TurnResumed": "resumed",
                "EagerEndOfTurn": "eager",
                "EndOfTurn": "final",
            }.get(packet.get("event"))
            if kind:
                await self.emit(
                    STTEvent(
                        kind,
                        text=packet.get("transcript", ""),
                        turn_id=f"{self._prefix}-{packet.get('turn_index', 0)}",
                        data={
                            "audio_window_end": packet.get("audio_window_end"),
                            "trigger": packet.get("trigger"),
                        },
                    )
                )

    async def configure(self, *, patient):
        if self.socket is None or patient == self._patient:
            return
        self._patient = patient
        await self.socket.send(
            json.dumps(
                {
                    "type": "Configure",
                    "thresholds": {
                        "eot_threshold": 0.85 if patient else 0.75,
                        "eager_eot_threshold": 0.65 if patient else 0.5,
                        "eot_timeout_ms": 8000 if patient else 5000,
                    },
                    "keyterms": self.hints,
                }
            )
        )

    async def send_input(self, pcm):
        if self.socket:
            await self.socket.send(pcm)

    async def force_end(self):
        if self.socket:
            await self.socket.send(json.dumps({"type": "ForceEndTurn"}))


class DeepgramTTS(_Transport):
    supported_models = frozenset({"flux-haley-en"})
    capabilities = TTSCapabilities(streaming_text=True, cancellation=True, spoken_prefix=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.tts = None
        self.tasks: list[asyncio.Task] = []
        self._epochs: deque[int] = deque()
        self._message_ids: deque[str] = deque()
        self._active_message_id = ""
        self._text_open = False
        self._active_epoch = 0
        self._speech_id = ""
        self._discard_audio = False
        self._interrupting = False
        self._interrupt_ready = asyncio.Event()
        self._interrupt_ready.set()
        self._tts_task = None
        self._connection_settings = None
        self._tts_url = ""
        self._playback_base = 0.0
        self._last_playback = 0.0

    async def open(self, *, playback_ms=0):
        self._last_playback = self._playback_base = playback_ms
        self._connection_settings = self.settings()
        speak = urlencode(dict(model=self.config.model, encoding="linear16", sample_rate=24000))
        self._tts_url = "wss://api.deepgram.com/v2/speak?" + speak
        self.tts = await self.connect(self._tts_url, self._connection_settings)
        self._tts_task = asyncio.create_task(self._receive(self.tts, self.handle_packet))
        self.tasks.append(self._tts_task)

    async def speak_text(self, text: str, epoch: int, message_id: str = "") -> None:
        if not self.tts:
            return
        try:
            async with asyncio.timeout(1):
                await self._interrupt_ready.wait()
        except TimeoutError as exc:
            raise ProviderError(
                "speech_interrupt_timeout", "Speech did not acknowledge interruption; reconnect voice."
            ) from exc
        if not self._text_open:
            self._epochs.append(epoch)
            self._message_ids.append(message_id)
            self._text_open = True
        await self.tts.send(json.dumps({"type": "Speak", "text": text}))

    async def finish_response(self) -> None:
        if self.tts and self._text_open:
            await self.tts.send(json.dumps({"type": "Flush"}))
            self._text_open = False

    async def interrupt(self, playback_ms: float | None = None) -> None:
        if playback_ms is not None:
            self._last_playback = playback_ms
        self._discard_audio = True
        if self.tts and (self._text_open or self._speech_id or self._epochs) and not self._interrupting:
            self._interrupting = True
            self._interrupt_ready.clear()
            packet = {"type": "Interrupt"}
            if playback_ms is not None:
                packet["playback_offset"] = {
                    "type": "time_ms",
                    "value": max(0, playback_ms - self._playback_base),
                }
            await self.tts.send(json.dumps(packet))

    async def cancel_output(self, playback_ms: float = 0) -> None:
        await self.interrupt(playback_ms)
        if self._interrupting:
            try:
                async with asyncio.timeout(1):
                    await self._interrupt_ready.wait()
            except TimeoutError:
                await self._replace_tts()

    async def _replace_tts(self) -> None:
        old = self.tts
        task = self._tts_task
        if task and task is not asyncio.current_task():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        if old:
            await old.close()
        if self._speech_id:
            await self.emit(
                TTSEvent("interrupted", speech_id=self._speech_id, message_id=self._active_message_id)
            )
        self.tts = await websockets.connect(self._tts_url, **(self._connection_settings or {}))
        self._playback_base = self._last_playback
        self._interrupted()
        self._discard_audio = True
        self._tts_task = asyncio.create_task(self._receive(self.tts, self.handle_packet))
        self.tasks.append(self._tts_task)

    def _interrupted(self) -> None:
        if self._interrupting:
            self._epochs.clear()
            self._message_ids.clear()
            self._speech_id = ""
            self._text_open = False
            self._interrupting = False
            self._interrupt_ready.set()

    async def handle_packet(self, packet) -> None:
        if isinstance(packet, bytes):
            if not self._discard_audio and self._speech_id:
                await self.emit(
                    TTSEvent("audio", speech_id=self._speech_id, epoch=self._active_epoch, pcm=packet)
                )
            return
        kind = packet.get("type")
        if kind == "SpeechStarted":
            self._speech_id = packet["speech_id"]
            if self._epochs:
                self._active_epoch = self._epochs.popleft()
                self._active_message_id = self._message_ids.popleft()
            if not self._interrupting:
                self._discard_audio = False
            await self.emit(
                TTSEvent(
                    "started",
                    speech_id=self._speech_id,
                    epoch=self._active_epoch,
                    message_id=self._active_message_id,
                )
            )
        elif kind == "SpeechMetadata":
            await self.emit(
                TTSEvent(
                    "finished", speech_id=packet.get("speech_id", self._speech_id), epoch=self._active_epoch
                )
            )
            self._speech_id = ""
            self._interrupted()
        elif kind == "SpeechInterrupted":
            speech_id = packet.get("metadata", {}).get("speech_id", self._speech_id)
            self._interrupted()
            await self.emit(
                TTSEvent(
                    "interrupted",
                    speech_id=speech_id,
                    message_id=self._active_message_id,
                    text_spoken=packet.get("text_spoken", ""),
                )
            )
        elif kind == "Warning":
            if self._interrupting and packet.get("code") in {
                "NO_AUDIO_GENERATED",
                "INVALID_INTERRUPT_OFFSET",
            }:
                await self._replace_tts()
            await self.status(type="tts_status", code=packet.get("code"))
        elif kind == "Error":
            self._interrupted()
            await self.status(
                type="speech_error", message="Speech synthesis failed.", code=packet.get("code")
            )
        elif kind == "Connected":
            await self.status(
                type="speech_provider", model=packet.get("model_name"), version=packet.get("model_version")
            )

    async def close(self):
        self.socket = self.tts
        await super().close()
        self.tts = None
        self._epochs.clear()
        self._message_ids.clear()
        self._speech_id = ""
        self._text_open = self._interrupting = False
        self._discard_audio = True
        self._interrupt_ready.set()
