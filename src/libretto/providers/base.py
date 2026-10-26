from typing import AsyncIterator, Protocol

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
