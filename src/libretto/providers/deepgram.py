"""Direct Flux streaming STT and TTS, scoped to one browser conversation."""

import asyncio
import json
import uuid
from collections import deque
from urllib.parse import urlencode

import websockets

from libretto.events import pack_audio
from libretto.providers.base import ProviderError, SessionCredentials
from libretto.providers.openrouter import check_status


class DeepgramSpeechAdapter:
    def __init__(self, credentials: SessionCredentials, session, send_audio, send_control):
        self.credentials, self.session = credentials, session
        self.send_audio, self.send_control = send_audio, send_control
        self.stt = self.tts = None
        self.tasks: list[asyncio.Task] = []
        self._epochs: deque[int] = deque()
        self._text_open = False
        self._active_epoch = 0
        self._speech_id = ""
        self._discard_audio = False
        self._interrupting = False
        self._interrupt_ready = asyncio.Event()
        self._interrupt_ready.set()
        self._patient = None
        self._prefix = "voice"

    async def open(self) -> None:
        key = self.credentials.key("deepgram")
        if not key:
            raise ProviderError("missing_deepgram_key", "Add a Deepgram key to enable live voice.")
        settings = dict(
            additional_headers={"Authorization": f"Token {key}"},
            ping_interval=20,
            ping_timeout=20,
            open_timeout=8,
            close_timeout=1,
            max_queue=16,
        )
        listen = urlencode(
            {
                "model": "flux-general-en",
                "encoding": "linear16",
                "sample_rate": 16000,
                "eot_threshold": 0.75,
                "eager_eot_threshold": 0.5,
                "eot_timeout_ms": 5000,
            }
        )
        speak = urlencode({"model": "flux-haley-en", "encoding": "linear16", "sample_rate": 24000})
        self._prefix = "voice-" + uuid.uuid4().hex[:8]
        try:
            connections = await asyncio.gather(
                websockets.connect("wss://api.deepgram.com/v2/listen?" + listen, **settings),
                websockets.connect("wss://api.deepgram.com/v2/speak?" + speak, **settings),
                return_exceptions=True,
            )
            self.stt, self.tts = [None if isinstance(c, BaseException) else c for c in connections]
            failure = next((c for c in connections if isinstance(c, BaseException)), None)
            if failure:
                raise failure
        except Exception as exc:
            status = getattr(getattr(exc, "response", None), "status_code", 503)
            await self.close()
            check_status(status)
            raise ProviderError("speech_connection_failed", "Could not connect to live speech.") from exc
        self.tasks = [
            asyncio.create_task(self._receive(self.stt, self.handle_stt)),
            asyncio.create_task(self._receive(self.tts, self.handle_tts)),
        ]
        await self.configure(patient=False)

    async def _receive(self, socket, handler) -> None:
        try:
            async for packet in socket:
                await handler(json.loads(packet) if isinstance(packet, str) else packet)
        except asyncio.CancelledError:
            raise
        except Exception:
            await self.send_control(
                {
                    "type": "speech_error",
                    "message": "The speech connection stopped. Reconnect or continue in text.",
                }
            )

    async def handle_stt(self, packet) -> None:
        if packet.get("type") == "ConfigureSuccess":
            await self.send_control({"type": "stt_config_applied", "settings": packet})
            return
        if packet.get("type") in {"ConfigureFailure", "Warning", "Error"}:
            await self.send_control(
                {
                    "type": "stt_status",
                    "code": packet.get("code"),
                    "message": "Speech configuration/provider event; see code.",
                }
            )
            return
        if packet.get("type") != "TurnInfo":
            return
        event, text = packet.get("event"), packet.get("transcript", "")
        turn_id = f"{self._prefix}-{packet.get('turn_index', 0)}"
        if event in {"StartOfTurn", "TurnResumed"}:
            await self.session.interrupt()
        elif event == "EagerEndOfTurn" and text:
            await self.session.submit_turn(text, turn_id, speculative=True)
        elif event == "EndOfTurn" and text:
            await self.send_control(
                {
                    "type": "transcript",
                    "text": text,
                    "turn_id": turn_id,
                    "audio_window_end": packet.get("audio_window_end"),
                    "trigger": packet.get("trigger"),
                }
            )
            await self.session.confirm_turn(text, turn_id)

    async def configure(self, *, patient: bool) -> None:
        if self.stt is None or patient == self._patient:
            return
        self._patient = patient
        terms = ["Northline", "Jamie", "Sam Rivera", "Maya Chen", "Alex Morgan", "billing", "partnerships"]
        await self.stt.send(
            json.dumps(
                {
                    "type": "Configure",
                    "thresholds": {
                        "eot_threshold": 0.85 if patient else 0.75,
                        "eager_eot_threshold": 0.65 if patient else 0.5,
                        "eot_timeout_ms": 8000 if patient else 5000,
                    },
                    "keyterms": terms,
                }
            )
        )

    async def send_input(self, pcm: bytes) -> None:
        if self.stt:
            await self.stt.send(pcm)

    async def force_end(self) -> None:
        if self.stt:
            await self.stt.send(json.dumps({"type": "ForceEndTurn"}))

    async def speak_text(self, text: str, epoch: int) -> None:
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
            self._text_open = True
        await self.tts.send(json.dumps({"type": "Speak", "text": text}))

    async def finish_response(self) -> None:
        if self.tts and self._text_open:
            await self.tts.send(json.dumps({"type": "Flush"}))
            self._text_open = False

    async def interrupt(self, playback_ms: float | None = None) -> None:
        self._discard_audio = True
        if self.tts and (self._text_open or self._speech_id or self._epochs) and not self._interrupting:
            self._interrupting = True
            self._interrupt_ready.clear()
            packet = {"type": "Interrupt"}
            if playback_ms is not None and playback_ms > 0:
                packet["playback_offset"] = {"type": "time_ms", "value": playback_ms}
            await self.tts.send(json.dumps(packet))

    def _interrupted(self) -> None:
        if self._interrupting:
            self._epochs.clear()
            self._speech_id = ""
            self._text_open = False
            self._interrupting = False
            self._interrupt_ready.set()

    async def handle_tts(self, packet) -> None:
        if isinstance(packet, bytes):
            if not self._discard_audio and self._speech_id:
                await self.send_audio(pack_audio(self._active_epoch, self._speech_id, packet))
            return
        kind = packet.get("type")
        if kind == "SpeechStarted":
            self._speech_id = packet["speech_id"]
            if self._epochs:
                self._active_epoch = self._epochs.popleft()
            if not self._interrupting:
                self._discard_audio = False
            await self.send_control(
                {
                    "type": "speech_started",
                    "speech_id": self._speech_id,
                    "epoch": self._active_epoch,
                    "sample_rate": 24000,
                }
            )
        elif kind == "SpeechMetadata":
            await self.send_control(
                {
                    "type": "speech_finished",
                    "speech_id": packet.get("speech_id"),
                    "epoch": self._active_epoch,
                    "metadata": packet,
                }
            )
            self._speech_id = ""
            self._interrupted()
        elif kind == "SpeechInterrupted":
            self._interrupted()
            await self.send_control({"type": "speech_interrupted", "metadata": packet})
        elif kind == "Warning":
            if self._interrupting:
                self._interrupted()
            await self.send_control({"type": "tts_status", "code": packet.get("code")})
        elif kind == "Error":
            self._interrupted()
            await self.send_control(
                {"type": "speech_error", "message": "Speech synthesis failed.", "code": packet.get("code")}
            )
        elif kind == "Connected":
            await self.send_control(
                {
                    "type": "speech_provider",
                    "model": packet.get("model_name"),
                    "version": packet.get("model_version"),
                }
            )

    async def close(self) -> None:
        for task in self.tasks:
            task.cancel()
        if self.tasks:
            await asyncio.gather(*self.tasks, return_exceptions=True)
        for socket in (self.stt, self.tts):
            if socket:
                await socket.close()
        self.stt = self.tts = None
        self.tasks.clear()
        self._epochs.clear()
        self._text_open = self._interrupting = False
        self._interrupt_ready.set()
