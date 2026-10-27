"""Provider-neutral speech orchestration. No vendor packets enter the runtime."""

import asyncio
from dataclasses import asdict

from libretto.events import pack_audio
from libretto.providers.base import ProviderError, STTEvent, STTProvider, TTSEvent, TTSProvider


class SpeechCoordinator:
    def __init__(self, session, stt: STTProvider, tts: TTSProvider, send_audio, send_control):
        self.session, self.stt, self.tts = session, stt, tts
        self.send_audio, self.send_control = send_audio, send_control
        self._first_audio = set()

    async def open(self, *, playback_ms: float = 0) -> None:
        if not (self.tts.capabilities.streaming_text and self.tts.capabilities.cancellation):
            raise ProviderError(
                "unsupported_speech_capabilities",
                "Live voice needs streaming text synthesis and cancellable audio.",
            )
        results = await asyncio.gather(
            self.stt.open(), self.tts.open(playback_ms=playback_ms), return_exceptions=True
        )
        failure = next((r for r in results if isinstance(r, BaseException)), None)
        if failure:
            await self.close()
            raise failure
        await self.send_control({"type": "speech_capabilities", **self.capabilities()})

    def capabilities(self) -> dict:
        return {"stt": asdict(self.stt.capabilities), "tts": asdict(self.tts.capabilities)}

    async def handle_stt(self, event: STTEvent) -> None:
        if event.kind in {"started", "resumed"}:
            await self.session.interrupt()
        elif event.kind == "eager" and event.text and self.stt.capabilities.eager_turns:
            await self.session.submit_turn(event.text, event.turn_id, speculative=True)
        elif event.kind == "final" and event.text:
            await self.session.confirm_turn(event.text, event.turn_id)
            await self.send_control(
                {"type": "transcript", **event.data, "text": event.text, "turn_id": event.turn_id, "epoch": self.session.epoch}
            )
        elif event.kind == "status":
            await self.send_control(dict(event.data))

    async def handle_tts(self, event: TTSEvent) -> None:
        if event.kind == "audio":
            if event.epoch == self.session.epoch:
                if event.speech_id not in self._first_audio:
                    self._first_audio.add(event.speech_id)
                    await self.send_control(
                        {
                            "type": "first_audio",
                            "speech_id": event.speech_id,
                            "message_id": self.session._speech_messages.get(event.speech_id, ""),
                            "epoch": event.epoch,
                        }
                    )
                await self.send_audio(pack_audio(event.epoch, event.speech_id, event.pcm))
        elif event.kind == "started":
            self.session.bind_speech(event.speech_id, event.message_id)
            await self.send_control(
                {
                    "type": "speech_started",
                    "speech_id": event.speech_id,
                    "epoch": event.epoch,
                    "sample_rate": 24000,
                    "message_id": event.message_id,
                }
            )
        elif event.kind == "finished":
            await self.send_control(
                {"type": "speech_finished", "speech_id": event.speech_id, "epoch": event.epoch}
            )
        elif event.kind == "interrupted":
            spoken = event.text_spoken if self.tts.capabilities.spoken_prefix else ""
            self.session.reconcile_speech(event.speech_id, spoken, interrupted=True)
            await self.send_control(
                {
                    "type": "speech_interrupted",
                    "speech_id": event.speech_id,
                    "text_spoken": spoken,
                    "message_id": event.message_id,
                }
            )
        elif event.kind == "status":
            await self.send_control(dict(event.data))

    async def configure(self, *, patient: bool) -> None:
        if self.stt.capabilities.patient_profiles:
            await self.stt.configure(patient=patient)

    async def force_end(self) -> None:
        if self.stt.capabilities.force_end:
            await self.stt.force_end()

    async def send_input(self, pcm: bytes) -> None:
        await self.stt.send_input(pcm)

    async def speak_text(self, text: str, epoch: int, message_id: str = "") -> None:
        await self.tts.speak_text(text, epoch, message_id)

    async def finish_response(self) -> None:
        await self.tts.finish_response()

    async def interrupt(self, playback_ms: float | None = None) -> None:
        await self.tts.interrupt(playback_ms)

    async def cancel_output(self, playback_ms: float = 0) -> None:
        await self.tts.cancel_output(playback_ms)

    async def close(self) -> None:
        await asyncio.gather(self.stt.close(), self.tts.close(), return_exceptions=True)


class SpeechRegistry:
    """Explicit factory allowlists; YAML cannot import code or choose network hosts.

    Factories receive (credentials, endpoint_config, event_sink, *, hints).
    Audio format contract: mono PCM16, STT 16 kHz / TTS 24 kHz. Adapters convert
    their provider's native format when necessary.
    """

    def __init__(self, *, stt: dict, tts: dict, credentials: dict[str, str]):
        self.stt, self.tts, self.credentials = dict(stt), dict(tts), dict(credentials)

    def validate(self, config) -> None:
        for kind in ("stt", "tts"):
            endpoint = getattr(config, kind)
            if endpoint.provider not in getattr(self, kind):
                raise ValueError(f"Unsupported {kind.upper()} provider: {endpoint.provider}")
            factory = getattr(self, kind)[endpoint.provider]
            supported_models = getattr(factory, "supported_models", None)
            if supported_models is not None and endpoint.model not in supported_models:
                raise ValueError(
                    f"Unsupported {kind.upper()} model for {endpoint.provider}: {endpoint.model}"
                )

    def required_credentials(self, config) -> set[str]:
        self.validate(config)
        return {
            self.credentials[p] for p in (config.stt.provider, config.tts.provider) if p in self.credentials
        }

    def create(self, config, credentials, session, send_audio, send_control) -> SpeechCoordinator:
        self.validate(config)

        # Bind sinks before open, when providers can first emit events.
        async def stt_sink(event):
            await coordinator.handle_stt(event)

        async def tts_sink(event):
            await coordinator.handle_tts(event)

        stt = self.stt[config.stt.provider](credentials, config.stt, stt_sink, hints=config.hints)
        tts = self.tts[config.tts.provider](credentials, config.tts, tts_sink, hints=config.hints)
        coordinator = SpeechCoordinator(session, stt, tts, send_audio, send_control)
        return coordinator


def default_speech_registry() -> SpeechRegistry:
    from libretto.providers.deepgram import DeepgramSTT, DeepgramTTS

    return SpeechRegistry(
        stt={"deepgram": DeepgramSTT}, tts={"deepgram": DeepgramTTS}, credentials={"deepgram": "deepgram"}
    )
