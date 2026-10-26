"""OpenRouter text streams and independent, structured semantic evaluation."""

import json
from collections import deque
from typing import AsyncIterator

import httpx

from libretto.providers.base import ProviderError, SessionCredentials
from libretto.schema import Models
from libretto.state import Evaluation, GenerationContext

URL = "https://openrouter.ai/api/v1/chat/completions"


def check_status(status: int) -> None:
    if status < 400:
        return
    code, message = {
        401: ("invalid_key", "This provider key was not accepted. Check it in Connection settings."),
        402: ("budget_exhausted", "The hosted API budget is exhausted. You can use your own key."),
        403: ("provider_denied", "This key or provider route does not permit the selected model."),
        429: ("rate_limited", "The provider is rate limiting requests. Wait briefly before retrying."),
    }.get(status, ("provider_unavailable", "The provider could not complete this request."))
    raise ProviderError(code, message)


def history(context: GenerationContext) -> list[dict[str, str]]:
    messages = []
    for message in context.snapshot.history[-30:]:
        content = message.content
        if message.interrupted:
            content += " [Interrupted; the caller may not have heard the complete response.]"
        messages.append({"role": message.role, "content": content})
    if not context.snapshot.history or context.snapshot.history[-1].turn_id != context.turn_id:
        messages.append({"role": "user", "content": context.text})
    return messages


class OpenRouterAdapter:
    def __init__(
        self,
        credentials: SessionCredentials,
        models: Models | None = None,
        *,
        client: httpx.AsyncClient | None = None,
    ):
        self.credentials, self.models = credentials, models or Models()
        self._owned = client is None
        self.client = client or httpx.AsyncClient(timeout=httpx.Timeout(20, connect=8))
        self.usage: deque[dict] = deque(maxlen=30)

    def headers(self) -> dict[str, str]:
        key = self.credentials.key("openrouter")
        if not key:
            raise ProviderError(
                "missing_openrouter_key", "Add an OpenRouter key in Connection settings to start."
            )
        return {
            "Authorization": f"Bearer {key}",
            "X-Title": "Libretto",
            "HTTP-Referer": "https://libretto.prasadjs.me",
        }

    async def stream_reply(self, context: GenerationContext) -> AsyncIterator[str]:
        body = {
            "model": self.models.speaker,
            "messages": [{"role": "system", "content": context.system}, *history(context)],
            "stream": True,
            "max_tokens": 220,
            "reasoning": {"effort": self.models.reasoning, "exclude": True},
        }
        try:
            async with self.client.stream("POST", URL, headers=self.headers(), json=body) as response:
                check_status(response.status_code)
                data_lines = []
                async for line in response.aiter_lines():
                    if line.startswith(":"):
                        continue
                    if line.startswith("data:"):
                        data_lines.append(line[5:].lstrip())
                        continue
                    if line or not data_lines:
                        continue
                    data = "\n".join(data_lines)
                    data_lines.clear()
                    if data == "[DONE]":
                        return
                    packet = json.loads(data)
                    if "error" in packet:
                        check_status(int(packet["error"].get("code", 500)))
                        raise ProviderError(
                            "stream_failed", "The provider stopped the response unexpectedly."
                        )
                    if packet.get("usage"):
                        self.usage.append(
                            {"model": self.models.speaker, "kind": "speaking", "usage": packet["usage"]}
                        )
                    for choice in packet.get("choices", []):
                        delta = choice.get("delta", {}).get("content")
                        if isinstance(delta, str) and delta:
                            yield delta
        except httpx.HTTPError as exc:
            raise ProviderError("network_error", "The model connection failed. Please try again.") from exc
        except (json.JSONDecodeError, TypeError, ValueError) as exc:
            raise ProviderError(
                "invalid_provider_response", "The provider returned an invalid response."
            ) from exc

    async def evaluate(self, context: GenerationContext) -> Evaluation:
        system = (
            "You interpret a voice workflow turn without speaking to the caller. Return only valid JSON. "
            "Propose facts explicitly supported by the CURRENT user text; each evidence string must be an exact "
            "quote from that text. Use history to resolve context, not as a source of newly claimed evidence. "
            "Capture multiple volunteered facts and corrections. Omit unknown facts; never invent consent. "
            "Use directory IDs support, billing, partnerships for recipients when the provided directory resolves them. "
            "A request to leave a message establishes message_consent. destination_confirmed requires explicit "
            "approval of the current recipient. message_confirmed requires agreement to the last complete readback "
            "with no changed details. Side questions do not replace an unfinished task. Match only applicable "
            "condition IDs; select none when staying in the stage. end_call only for explicit goodbye/end-call; "
            "cancel_request abandons the current task; stop_talking stops only speech. Ambiguous stop is not end_call.\n"
            f"FIELDS: {json.dumps(context.fields)}\nCONDITIONS: {json.dumps(context.conditions)}\n"
            f"STAGE AND REFERENCE CONTEXT: {context.system}\n"
            "OUTPUT SCHEMA: " + json.dumps(Evaluation.model_json_schema())
        )
        body = {
            "model": self.models.evaluator,
            "messages": [{"role": "system", "content": system}, *history(context)],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "workflow_evaluation",
                    "strict": False,
                    "schema": Evaluation.model_json_schema(),
                },
            },
            "max_tokens": 800,
            "reasoning": {"effort": "minimal", "exclude": True},
        }
        try:
            response = await self.client.post(URL, headers=self.headers(), json=body)
            check_status(response.status_code)
            data = response.json()
            if data.get("usage"):
                self.usage.append(
                    {"model": self.models.evaluator, "kind": "evaluation", "usage": data["usage"]}
                )
            return Evaluation.model_validate_json(data["choices"][0]["message"]["content"])
        except httpx.HTTPError as exc:
            raise ProviderError("network_error", "The state evaluator connection failed.") from exc
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise ProviderError(
                "invalid_evaluation", "The evaluator returned invalid state; existing state retained."
            ) from exc

    async def close(self) -> None:
        if self._owned:
            await self.client.aclose()
