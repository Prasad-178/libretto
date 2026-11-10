"""Catalog discovery never requires credentials or invokes inference."""

import httpx


def model(**overrides):
    return {
        "id": "example/reasoner", "name": "Example Reasoner", "context_length": 128000,
        "architecture": {"output_modalities": ["text"]},
        "pricing": {"prompt": "0.00000015", "completion": "0", "request": "0.001"},
        "supported_parameters": ["reasoning"],
        "reasoning": {"supported_efforts": ["high", "low"], "default_effort": "low", "mandatory": True},
        **overrides,
    }


async def test_catalog_uses_public_metadata_and_preserves_price_units_and_effort_capabilities():
    from libretto.model_catalog import OpenRouterCatalog

    def upstream(request):
        assert request.method == "GET"
        assert str(request.url) == "https://openrouter.ai/api/v1/models"
        assert "authorization" not in request.headers
        return httpx.Response(200, json={"data": [model(), model(id="other/plain", pricing={"prompt": "NaN"}, reasoning={})]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as client:
        result = await OpenRouterCatalog(client=client).get()
    assert result["status"] == "fresh"
    first, second = result["models"]
    assert first["id"] == "example/reasoner"
    assert first["pricing"] == {"inputPerMillion": "0.15000000", "outputPerMillion": "0", "request": "0.001"}
    assert first["reasoning"]["supported_efforts"] == ["high", "low"]
    assert first["reasoning"]["default_effort"] == "low"
    assert second["pricing"]["inputPerMillion"] is None
    assert second["pricing"]["outputPerMillion"] is None
    assert "default_effort" not in second["reasoning"]


async def test_catalog_caches_defensively_and_recovers_after_a_bounded_failure_retry():
    from libretto.model_catalog import OpenRouterCatalog

    clock = [0.0]
    calls = []

    def upstream(request):
        calls.append(request)
        if len(calls) == 2:
            return httpx.Response(503, text="private upstream diagnostic")
        return httpx.Response(200, json={"data": [model()]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as client:
        catalog = OpenRouterCatalog(client=client, now=lambda: clock[0])
        result = await catalog.get()
        result["models"].clear()
        assert len((await catalog.get())["models"]) == 1
        assert len(calls) == 1
        clock[0] = 3601
        stale = await catalog.get()
        assert stale["status"] == "stale"
        assert stale["models"][0]["id"] == "example/reasoner"
        assert "private" not in str(stale)
        await catalog.get()
        assert len(calls) == 2
        clock[0] += 61
        assert (await catalog.get())["status"] == "fresh"
        assert len(calls) == 3


async def test_failed_or_malformed_catalog_is_explicitly_unavailable_without_invented_models():
    from libretto.model_catalog import OpenRouterCatalog

    for response in [httpx.Response(401), httpx.Response(200, json={"unexpected": []}), httpx.Response(200, json={"data": []})]:
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: response)) as client:
            result = await OpenRouterCatalog(client=client).get()
        assert result["status"] == "unavailable"
        assert result["models"] == []
        assert result["fetchedAt"] is None


async def test_studio_catalog_endpoint_exposes_discovery_without_provider_credentials(monkeypatch):
    from fastapi.testclient import TestClient

    from libretto.model_catalog import OpenRouterCatalog
    from libretto.server import create_app

    async with httpx.AsyncClient(transport=httpx.MockTransport(
        lambda _: httpx.Response(200, json={"data": [model()]})
    )) as client:
        catalog = OpenRouterCatalog(client=client)
        monkeypatch.setattr("libretto.server.OpenRouterCatalog", lambda: catalog)
        with TestClient(create_app(load_environment=False)) as studio:
            response = studio.get("/api/studio/models")
            assert response.status_code == 200
            assert response.json()["models"][0]["id"] == "example/reasoner"
            assert response.json()["currency"] == "USD"


async def test_catalog_does_not_present_expired_prices_as_available():
    from libretto.model_catalog import OpenRouterCatalog

    clock = [0.0]

    def upstream(_):
        if clock[0] > 0:
            raise httpx.ConnectError("unreachable")
        return httpx.Response(200, json={"data": [model()]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as client:
        catalog = OpenRouterCatalog(client=client, now=lambda: clock[0])
        assert (await catalog.get())["status"] == "fresh"
        clock[0] = 86401
        result = await catalog.get()
        assert result["status"] == "unavailable"
        assert result["models"] == []


async def test_concurrent_catalog_requests_share_one_fetch():
    import asyncio

    from libretto.model_catalog import OpenRouterCatalog

    calls = []

    async def upstream(request):
        calls.append(request)
        await asyncio.sleep(0)
        return httpx.Response(200, json={"data": [model()]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as client:
        catalog = OpenRouterCatalog(client=client)
        results = await asyncio.gather(*(catalog.get() for _ in range(5)))
    assert len(calls) == 1
    assert all(result["status"] == "fresh" for result in results)
