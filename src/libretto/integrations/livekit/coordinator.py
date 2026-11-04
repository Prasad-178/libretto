"""One LiveKit AgentSession connected to the existing Libretto workflow session."""

import asyncio
import logging
from dataclasses import asdict

from livekit.agents import AgentSession, TurnHandlingOptions

from libretto.api import WorkflowRunner
from libretto.providers.base import ProviderError, STTCapabilities, TTSCapabilities

from .agent import WorkflowAgent
from .audio import BrowserAudioInput, BrowserAudioOutput, SpeechBinding
from .models import create_models


class LiveKitCoordinator:
    def __init__(
        self, config, credentials, runner, send_audio, send_control, *, models=None, agent_type=WorkflowAgent
    ):
        self.config, self.credentials = config, credentials
        self.core = runner._session if isinstance(runner, WorkflowRunner) else runner
        self.send_audio, self.control = send_audio, send_control
        self.models = models
        self.agent_type = agent_type
        self.sdk = None
        self.input = BrowserAudioInput()
        self.output = BrowserAudioOutput(self)
        self.handles: dict[str, SpeechBinding] = {}
        self.bindings: dict[str, SpeechBinding] = {}
        self.writing: SpeechBinding | None = None
        self.tasks: set[asyncio.Task] = set()
        self.closed = False
        self.input_interruption = None

    def spawn(self, coroutine) -> asyncio.Task:
        task = asyncio.create_task(coroutine)
        self.tasks.add(task)

        def finished(done):
            self.tasks.discard(done)
            if not done.cancelled() and done.exception() and not self.closed:
                logging.getLogger(__name__).warning("A voice transport callback failed")

        task.add_done_callback(finished)
        return task

    def _user_state_changed(self, event) -> None:
        if event.new_state == "speaking" and not self.closed:
            self.input_interruption = self.spawn(self.core.interrupt())

    def _provider_error(self, event) -> None:
        if not self.closed:
            self.spawn(
                self.core.emit(
                    "speech_error",
                    code="voice_provider_failed",
                    message="The voice provider could not complete the request. Check Connection settings and restart the test.",
                )
            )

    async def submit_final(self, text: str, turn_id: str) -> None:
        # Complete the speech-start invalidation before starting fresh generation.
        if self.input_interruption:
            await self.input_interruption
        if not self.closed:
            await self.core.submit_turn(text, turn_id)

    def capabilities(self) -> dict:
        return {
            "engine": "livekit",
            "delivery": "browser-acknowledgement",
            "stt": asdict(STTCapabilities(force_end=True)),
            "tts": asdict(TTSCapabilities(streaming_text=True, cancellation=True)),
        }

    async def open(self, *, playback_ms=0) -> None:
        if self.closed:
            raise ProviderError("voice_closed", "This voice connection is closed; start a new test.")
        if self.sdk:
            return
        self.models = self.models or create_models(self.config, self.credentials)
        recognition, synthesis = self.models
        self.sdk = AgentSession(
            stt=recognition,
            tts=synthesis,
            user_away_timeout=None,
            turn_handling=TurnHandlingOptions(
                turn_detection="stt",
                preemptive_generation={"enabled": False},
                interruption={"resume_false_interruption": False},
            ),
        )
        self.sdk.on("user_state_changed", self._user_state_changed)
        self.sdk.on("error", self._provider_error)
        self.sdk.input.audio = self.input
        self.sdk.output.audio = self.output
        await self.sdk.start(agent=self.agent_type(self), record=False, session_host=False)
        await self.control({"type": "speech_capabilities", **self.capabilities()})

    async def send_input(self, pcm: bytes) -> None:
        if not self.closed:
            self.input.push(pcm)

    async def speak_text(self, text: str, epoch: int, message_id: str = "") -> None:
        if self.closed or epoch != self.core.epoch:
            return
        if self.writing is None or self.writing.message_id != message_id:
            self.writing = SpeechBinding(message_id, epoch)
            binding = self.writing
            self.core.bind_speech(binding.speech_id, message_id)
            handle = self.sdk.say(binding.chunks(), add_to_chat_ctx=False)
            binding.handle = handle
            self.handles[handle.id] = binding
            self.bindings[binding.speech_id] = binding
        await self.writing.text.put(text)

    async def finish_response(self) -> None:
        if self.writing:
            binding, self.writing = self.writing, None
            await binding.text.put(None)

    async def playback_finished(self, speech_id: str, *, epoch: int) -> None:
        binding = self.bindings.get(speech_id)
        if (
            not binding
            or binding.epoch != epoch
            or binding.interrupted
            or binding.acknowledged
            or not binding.flushed
            or binding is not self.output.active
        ):
            return
        if not self.core.playback_finished(speech_id, epoch=epoch):
            return
        binding.acknowledged = True
        self.output.on_playback_finished(playback_position=binding.samples / 24000, interrupted=False)

    async def interrupt(self, playback_ms=None) -> None:
        await self.cancel_output(playback_ms or 0)

    async def cancel_output(self, playback_ms=0) -> None:
        self.writing = None
        for binding in tuple(self.bindings.values()):
            if binding.handle and not binding.handle.done():
                binding.interrupted = True
                binding.handle.interrupt()
        if self.sdk:
            await self.sdk.interrupt(force=True)

    async def configure(self, *, patient: bool) -> None:
        # Patient-mode provider tuning is not claimed by this adapter.
        return None

    async def force_end(self) -> None:
        if self.sdk:
            self.sdk.commit_user_turn()

    async def close(self) -> None:
        if self.closed:
            return
        self.closed = True
        self.input.close()
        if self.sdk:
            await self.sdk.aclose()
        if self.models:
            await asyncio.gather(*(model.aclose() for model in self.models), return_exceptions=True)
        if self.tasks:
            await asyncio.gather(*tuple(self.tasks), return_exceptions=True)
