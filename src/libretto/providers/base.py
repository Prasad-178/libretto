from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Literal, Protocol

from pydantic import SecretStr

from libretto.state import Evaluation, GenerationContext


class ProviderError(Exception):
    def __init__(self, code: str, public_message: str):
        super().__init__(public_message)
        self.code, self.public_message = code, public_message


CREDENTIAL_NAMES = (
    "openrouter",
    "deepgram",
    "livekit_api_key",
    "livekit_api_secret",
    "assemblyai",
    "cartesia",
)


class SessionCredentials:
    """Ephemeral secrets with origin labels; public status contains no values."""

    def __init__(self, *, sources: dict | None = None, **keys: str):
        if set(keys) - set(CREDENTIAL_NAMES):
            raise ValueError("Unsupported credential name")
        if any(not isinstance(value, str) or len(value) > 1024 for value in keys.values()):
            raise ValueError("Credential must be a string of at most 1024 characters")
        self._keys = {name: SecretStr(keys.get(name, "")) for name in CREDENTIAL_NAMES}
        self._sources = sources or {
            name: "hosted" if keys.get(name) else "missing" for name in CREDENTIAL_NAMES
        }

    def __repr__(self) -> str:
        return "SessionCredentials(<redacted>)"

    def key(self, provider: str) -> str:
        return self._keys[provider].get_secret_value()

    def public_status(self) -> dict[str, str]:
        return dict(self._sources)

    def with_overrides(self, **keys: str) -> "SessionCredentials":
        if set(keys) - set(CREDENTIAL_NAMES):
            raise ValueError("Unsupported credential name")
        overrides = {name: keys.get(name, "").strip() for name in CREDENTIAL_NAMES}
        return SessionCredentials(
            **{name: value or self.key(name) for name, value in overrides.items()},
            sources={name: "visitor" if value else self._sources[name] for name, value in overrides.items()},
        )

    def clear(self) -> None:
        self._keys = {name: SecretStr("") for name in CREDENTIAL_NAMES}
        self._sources = {name: "missing" for name in CREDENTIAL_NAMES}


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
