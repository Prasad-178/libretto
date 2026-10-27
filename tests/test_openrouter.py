import json

import httpx
import pytest


class Fragments(httpx.AsyncByteStream):
    async def __aiter__(self):
        text = ': keepalive\n\ndata: {"choices":[{"delta":{"content":"Hello "}}]}\n\ndata: {"choices":[{"delta":{"content":"Sam."}}]}\n\ndata: [DONE]\n\n'
        for piece in [text[:17], text[17:51], text[51:99], text[99:]]:
            yield piece.encode()


def context():
    from libretto.state import GenerationContext, Message, StageSnapshot

    snapshot = StageSnapshot("faq", 0, 1, {}, (Message("user", "Hours?", "t1"),))
    return GenerationContext("t1", "Hours?", snapshot, "Speak English.")


async def test_streams_fragmented_sse_and_ignores_comments():
    from libretto.providers.base import SessionCredentials
    from libretto.providers.openrouter import OpenRouterAdapter

    def handler(request):
        body = json.loads(request.content)
        assert body["stream"] is True
        assert request.headers["authorization"] == "Bearer visitor-one"
        return httpx.Response(200, stream=Fragments())

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        adapter = OpenRouterAdapter(SessionCredentials(openrouter="visitor-one"), client=client)
        assert "".join([part async for part in adapter.stream_reply(context())]) == "Hello Sam."


@pytest.mark.parametrize(
    "status,code", [(401, "invalid_key"), (402, "budget_exhausted"), (429, "rate_limited")]
)
async def test_provider_errors_are_distinct_and_do_not_expose_response_secrets(status, code):
    from libretto.providers.base import ProviderError, SessionCredentials
    from libretto.providers.openrouter import OpenRouterAdapter

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda _: httpx.Response(status, json={"error": {"message": "SECRET private upstream body"}})
        )
    ) as client:
        adapter = OpenRouterAdapter(SessionCredentials(openrouter="SECRET"), client=client)
        with pytest.raises(ProviderError) as caught:
            _ = [part async for part in adapter.stream_reply(context())]
        assert caught.value.code == code
        assert "SECRET" not in str(caught.value)


async def test_evaluator_json_is_validated_and_does_not_enter_speaking_stream():
    from libretto.providers.base import SessionCredentials
    from libretto.providers.openrouter import OpenRouterAdapter

    response = {
        "choices": [
            {
                "message": {
                    "content": json.dumps(
                        {
                            "updates": {"recipient": {"value": "billing", "evidence": "billing"}},
                            "matches": ["transfer_request"],
                            "reason": "Explicit destination",
                            "control": "continue",
                        }
                    )
                }
            }
        ]
    }
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda _: httpx.Response(200, json=response))
    ) as client:
        result = await OpenRouterAdapter(SessionCredentials(openrouter="test"), client=client).evaluate(
            context()
        )
        assert result.updates["recipient"].value == "billing"
        assert result.matches == ["transfer_request"]


async def test_two_sessions_sharing_http_pool_keep_separate_credentials():
    from libretto.providers.base import SessionCredentials
    from libretto.providers.openrouter import OpenRouterAdapter

    seen = []

    def handler(request):
        seen.append(request.headers["authorization"])
        return httpx.Response(200, stream=Fragments())

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as pool:
        first = OpenRouterAdapter(SessionCredentials(openrouter="one"), client=pool)
        second = OpenRouterAdapter(SessionCredentials(openrouter="two"), client=pool)
        _ = [part async for part in first.stream_reply(context())]
        _ = [part async for part in second.stream_reply(context())]
        assert seen == ["Bearer one", "Bearer two"]
        assert "authorization" not in pool.headers


async def test_evaluation_request_separates_routing_from_speaker_instructions():
    from dataclasses import replace

    from libretto.providers.base import SessionCredentials
    from libretto.providers.openrouter import OpenRouterAdapter

    current = replace(
        context(),
        system="SPEAKER-ONLY: Ask the caller whether to transfer them.",
        fields={"caller_name": {"type": "string", "description": "Name given by caller"}},
        conditions={"information": "Caller asks for company information."},
    )

    def handler(request):
        body = json.loads(request.content)
        system = body["messages"][0]["content"]
        assert "SPEAKER-ONLY" not in system
        schema = body["response_format"]["json_schema"]["schema"]
        assert schema["properties"]["matches"]["items"]["enum"] == ["information"]
        assert schema["properties"]["updates"]["additionalProperties"] is False
        assert set(schema["properties"]["updates"]["properties"]) == {"caller_name"}
        return httpx.Response(
            200, json={"choices": [{"message": {"content": '{"matches":["information"]}'}}]}
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await OpenRouterAdapter(SessionCredentials(openrouter="test"), client=client).evaluate(
            current
        )
        assert result.matches == ["information"]


async def test_unknown_facts_are_null_on_wire_and_omitted_from_updates():
    from dataclasses import replace

    from libretto.providers.base import SessionCredentials
    from libretto.providers.openrouter import OpenRouterAdapter

    current = replace(
        context(), fields={"caller_name": {"type": "string"}, "callback_number": {"type": "string"}}
    )

    def handler(request):
        schema = json.loads(request.content)["response_format"]["json_schema"]["schema"]
        assert set(schema["properties"]["updates"]["required"]) == {"caller_name", "callback_number"}
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "matches": [],
                                    "updates": {
                                        "caller_name": {"value": "Taylor", "evidence": "Taylor"},
                                        "callback_number": None,
                                    },
                                    "control": "continue",
                                    "reason": "Name supplied; number unknown.",
                                }
                            )
                        }
                    }
                ]
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await OpenRouterAdapter(SessionCredentials(openrouter="test"), client=client).evaluate(
            current
        )
        assert set(result.updates) == {"caller_name"}
