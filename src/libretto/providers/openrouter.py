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
        schema = Evaluation.model_json_schema()
        schema["required"] = ["matches", "updates", "control", "reason"]
        schema["properties"]["matches"]["items"]["enum"] = list(context.conditions)
        if not context.conditions:
            schema["properties"]["matches"] = {"type": "array", "maxItems": 0, "items": {"type": "string"}}
        schema["properties"]["updates"] = {
            "type": "object",
            "properties": {
                key: {"anyOf": [{"$ref": "#/$defs/FactPatch"}, {"type": "null"}]} for key in context.fields
            },
            "required": list(context.fields),
            "additionalProperties": False,
        }
        system = (
            "You route a workflow and extract facts; you never speak to the caller. Return JSON with "
            "matches, updates, control and reason. First select matching CONDITION IDs for the CURRENT "
            "stage. An information question matches the information condition when available. "
            "Use [] only if no condition applies; never invent a condition or field.\n"
            "Inspect EVERY configured field. Extract ALL facts volunteered in CURRENT USER TEXT at once, "
            "even before their collection stage. Do not wait for recipient confirmation to extract a name, "
            "number, message or message_consent. Use null for an unchanged or unknown field. Evidence "
            "must be an exact quote from that text, never a quote from history. Omit unknown fields; "
            "unknown does not mean declined. Declined means explicit refusal of that specific detail. "
            "Use history only to resolve references and what the caller is agreeing to.\n"
            "A booking enquiry, information question or request for help is NOT consent to leave a "
            "message. message_consent requires an explicit request/agreement to leave a message. "
            "destination_confirmed requires approval of the specific transfer destination. "
            "message_confirmed requires agreement to an existing full readback with no corrections. "
            "Directory recipients use department IDs. Side questions preserve unfinished tasks. "
            "end_call only for an explicit goodbye/end-call; cancel_request abandons the task; "
            "stop_talking stops speech only. Otherwise control=continue.\n"
            f"CURRENT STAGE: {context.snapshot.stage}\n"
            f"CONDITIONS: {json.dumps(context.conditions)}\n"
            f"FIELDS: {json.dumps(context.fields)}\n"
            f"RECORDED FACTS: {json.dumps(context.snapshot.facts)}\n"
            f"HAS COMPLETE READBACK: {bool(context.snapshot.readback_fingerprint)}\n"
            f"DIRECTORY: {context.directory}\n"
            f"CURRENT USER TEXT: {json.dumps(context.text)}"
        )
        body = {
            "model": self.models.evaluator,
            "messages": [{"role": "system", "content": system}, *history(context)],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "workflow_evaluation",
                    "strict": False,
                    "schema": schema,
                },
            },
            "max_tokens": 1100,
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
            if data["choices"][0].get("finish_reason") == "length":
                raise ProviderError(
                    "evaluation_truncated", "State evaluation exceeded its output limit; state retained."
                )
            payload = json.loads(data["choices"][0]["message"]["content"])
            payload["updates"] = {
                key: patch for key, patch in payload.get("updates", {}).items() if patch is not None
            }
            return Evaluation.model_validate(payload)
        except httpx.HTTPError as exc:
            raise ProviderError("network_error", "The state evaluator connection failed.") from exc
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise ProviderError(
                "invalid_evaluation", "The evaluator returned invalid state; existing state retained."
            ) from exc

    async def close(self) -> None:
        if self._owned:
            await self.client.aclose()
