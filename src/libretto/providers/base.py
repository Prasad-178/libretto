from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Literal, Protocol

from pydantic import SecretStr

from libretto.state import Evaluation, GenerationContext


class ProviderError(Exception):
    def __init__(self, code: str, public_message: str):
        super().__init__(public_message)
        self.code, self.public_message = code, public_message


class SessionCredentials:
    def __init__(self, *, openrouter: str = "", deepgram: str = "", sources: dict | None = None):
        self._keys = {"openrouter": SecretStr(openrouter), "deepgram": SecretStr(deepgram)}
        self._sources = sources or {
            name: "hosted" if value else "missing"
            for name, value in (("openrouter", openrouter), ("deepgram", deepgram))
        }

    def __repr__(self) -> str:
        return "SessionCredentials(<redacted>)"

    def key(self, provider: str) -> str:
        return self._keys[provider].get_secret_value()

    def public_status(self) -> dict[str, str]:
        return dict(self._sources)

    def with_overrides(self, *, openrouter: str = "", deepgram: str = "") -> "SessionCredentials":
        overrides = {"openrouter": openrouter.strip(), "deepgram": deepgram.strip()}
        if any(len(value) > 1024 for value in overrides.values()):
            raise ValueError("Credential is too long")
        return SessionCredentials(
            **{name: value or self.key(name) for name, value in overrides.items()},
            sources={name: "visitor" if value else self._sources[name] for name, value in overrides.items()},
        )

    def clear(self) -> None:
        self._keys = {name: SecretStr("") for name in self._keys}
        self._sources = {name: "missing" for name in self._sources}


class Responder(Protocol):
    def stream_reply(self, context: GenerationContext) -> AsyncIterator[str]: ...


class Evaluator(Protocol):
    async def evaluate(self, context: GenerationContext) -> Evaluation: ...


# Providers emit inference/transport events; only the coordinator calls the runtime.


@dataclass(frozen=True)
class STTCapabilities:
    eager_turns: bool = False
    patient_profiles: bool = False
    force_end: bool = False


@dataclass(frozen=True)
class TTSCapabilities:
    streaming_text: bool = False
    cancellation: bool = False
    spoken_prefix: bool = False


@dataclass(frozen=True)
class STTEvent:
    kind: Literal["started", "resumed", "eager", "final", "status"]
    text: str = ""
    turn_id: str = ""
    data: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class TTSEvent:
    kind: Literal["started", "audio", "finished", "interrupted", "status"]
    speech_id: str = ""
    epoch: int = 0
    message_id: str = ""
    pcm: bytes = b""
    text_spoken: str = ""
    data: dict[str, Any] = field(default_factory=dict)


STTEventSink = Callable[[STTEvent], Awaitable[None]]
TTSEventSink = Callable[[TTSEvent], Awaitable[None]]


class STTProvider(Protocol):
    capabilities: STTCapabilities

    async def open(self) -> None: ...
    async def close(self) -> None: ...
    async def send_input(self, pcm: bytes) -> None: ...
    async def configure(self, *, patient: bool) -> None: ...
    async def force_end(self) -> None: ...


class TTSProvider(Protocol):
    capabilities: TTSCapabilities

    async def open(self, *, playback_ms: float = 0) -> None: ...
    async def close(self) -> None: ...
    async def speak_text(self, text: str, epoch: int, message_id: str = "") -> None: ...
    async def finish_response(self) -> None: ...
    async def interrupt(self, playback_ms: float | None = None) -> None: ...
    async def cancel_output(self, playback_ms: float = 0) -> None: ...
