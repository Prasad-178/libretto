"""Voice discovery is metadata-only and never mixes inference compatibility/account data."""

import httpx
import pytest
from fastapi.testclient import TestClient


async def test_inference_suggestions_need_no_provider_key_or_network():
    from libretto.voice_catalog import VoiceQuery, discover_voices

    async def denied(request):
        raise AssertionError("Inference suggestions do not contact provider accounts")

    async with httpx.AsyncClient(transport=httpx.MockTransport(denied)) as client:
        result = await discover_voices(VoiceQuery(provider="cartesia", model="sonic-3"), client=client)
    assert result["kind"] == "suggested"
    assert any(v["name"] == "Jacqueline" for v in result["voices"])
    assert result["nextCursor"] is None
    assert "custom" in result["guidance"].lower()


async def test_cartesia_account_discovery_forwards_bounded_cursor_and_never_returns_secrets():
    from libretto.voice_catalog import VoiceQuery, discover_voices

    calls = []

    async def provider(request):
        calls.append(request)
        assert request.headers["Authorization"] == "Bearer example-private-key"
        return httpx.Response(
            200,
            json={
                "data": [
                    {"id": "voice-a", "name": "Account voice", "language": "en", "private": "not forwarded"}
                ],
                "has_more": True,
                "next_page": "voice-a",
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
        result = await discover_voices(
            VoiceQuery(
                provider="cartesia",
                model="sonic-3",
                credentialMode="providers",
                query="support",
                cursor="previous",
            ),
            client=client,
            key="example-private-key",
        )
    assert calls[0].url.host == "api.cartesia.ai"
    assert calls[0].url.params["limit"] == "40"
    assert calls[0].url.params["starting_after"] == "previous"
    assert calls[0].url.params["q"] == "support"
    assert result["kind"] == "account"
    assert result["nextCursor"] == "voice-a"
    assert "private" not in str(result)


def test_voice_endpoint_is_no_store_and_redacts_provider_failures():
    from libretto.server import create_app

    app = create_app(load_environment=False)
    with TestClient(app) as client:
        response = client.post("/api/studio/voices", json={"provider": "cartesia", "model": "sonic-3"})
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        assert response.json()["kind"] == "suggested"
        invalid = client.post("/api/studio/voices", json={"provider": "arbitrary-host", "model": "x"})
        assert invalid.status_code == 422
        account = client.post(
            "/api/studio/voices",
            json={"provider": "cartesia", "model": "sonic-3", "credentialMode": "providers"},
        )
        assert account.status_code == 200
        assert account.json()["kind"] == "suggested"


async def test_provider_failures_and_malformed_pages_have_only_safe_errors():
    from libretto.voice_catalog import VoiceCatalogError, VoiceQuery, discover_voices

    for response in (
        httpx.Response(403, text="private-key"),
        httpx.Response(200, json={"data": "private-key"}),
    ):
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: response)) as client:
            with pytest.raises(VoiceCatalogError) as error:
                await discover_voices(
                    VoiceQuery(provider="cartesia", model="sonic-3", credentialMode="providers"),
                    client=client,
                    key="private-key",
                )
            assert "private-key" not in str(error.value)


async def test_nonadvancing_or_missing_pagination_cursors_are_rejected():
    from libretto.voice_catalog import VoiceCatalogError, VoiceQuery, discover_voices

    for cursor in (None, "same"):
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda _: httpx.Response(200, json={"data": [], "has_more": True, "next_page": cursor})
            )
        ) as client:
            with pytest.raises(VoiceCatalogError):
                await discover_voices(
                    VoiceQuery(
                        provider="cartesia", model="sonic-3", credentialMode="providers", cursor="same"
                    ),
                    client=client,
                    key="example-key",
                )
