"""Public OpenRouter model metadata, isolated from inference and credentials."""

import asyncio
import copy
import time
from datetime import UTC, datetime
from decimal import Decimal, DecimalException
from typing import Callable

import httpx

CATALOG_URL = "https://openrouter.ai/api/v1/models"
EFFORTS = {"none", "minimal", "low", "medium", "high", "xhigh", "max"}


def _price(value: object, multiplier: int = 1) -> str | None:
    try:
        number = Decimal(str(value))
        if number.is_finite() and number >= 0:
            return str(number * multiplier)
    except (DecimalException, ValueError):
        pass
    return None


def _normalize(item: object) -> dict | None:
    if not isinstance(item, dict):
        return None
    model_id, name = item.get("id"), item.get("name")
    if not isinstance(model_id, str) or not 0 < len(model_id) <= 200:
        return None
    architecture = item.get("architecture")
    outputs = architecture.get("output_modalities") if isinstance(architecture, dict) else None
    if isinstance(outputs, list) and "text" not in outputs:
        return None
    prices = item.get("pricing")
    prices = prices if isinstance(prices, dict) else {}
    model = {
        "id": model_id,
        "name": name[:200] if isinstance(name, str) and name else model_id,
        "pricing": {
            "inputPerMillion": _price(prices.get("prompt"), 1_000_000),
            "outputPerMillion": _price(prices.get("completion"), 1_000_000),
            "request": _price(prices.get("request")),
        },
    }
    context = item.get("context_length")
    if isinstance(context, int) and not isinstance(context, bool) and context > 0:
        model["contextLength"] = context
    reasoning = item.get("reasoning")
    if isinstance(reasoning, dict):
        normalized = {}
        efforts = reasoning.get("supported_efforts")
        if "supported_efforts" in reasoning and efforts is None:
            normalized["supported_efforts"] = None
        elif isinstance(efforts, list):
            normalized["supported_efforts"] = list(
                dict.fromkeys(e for e in efforts if isinstance(e, str) and e in EFFORTS)
            )
        if isinstance(reasoning.get("default_effort"), str) and reasoning["default_effort"] in EFFORTS:
            normalized["default_effort"] = reasoning["default_effort"]
        for key in ("default_enabled", "mandatory", "supports_max_tokens"):
            if isinstance(reasoning.get(key), bool):
                normalized[key] = reasoning[key]
        model["reasoning"] = normalized
    return model


class OpenRouterCatalog:
    """One public cache per Studio app; stale metadata is labelled, never fabricated.

    Fresh for one hour; failures back off for a minute. Data older than a day is
    unavailable. Callers receive copies so UI/request code cannot mutate the cache.
    """

    def __init__(self, *, client: httpx.AsyncClient | None = None, now: Callable = time.time):
        self._client, self._now = client, now
        self._models: list[dict] = []
        self._fetched: float | None = None
        self._retry_at = 0.0
        self._lock = asyncio.Lock()

    async def _fetch(self) -> list[dict]:
        if self._client is not None:
            response = await self._client.get(CATALOG_URL, timeout=5)
        else:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(CATALOG_URL)
        response.raise_for_status()
        if len(response.content) > 8_000_000:
            raise ValueError("Catalog exceeds metadata limit")
        payload = response.json()
        if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
            raise ValueError("Invalid catalog shape")
        models = {}
        for item in payload["data"]:
            if normalized := _normalize(item):
                models.setdefault(normalized["id"], normalized)
        if not models:
            raise ValueError("No text models in catalog")
        return list(models.values())

    async def get(self) -> dict:
        async with self._lock:
            now = self._now()
            if (self._fetched is None or now - self._fetched >= 3600) and now >= self._retry_at:
                try:
                    models = await self._fetch()
                except (httpx.HTTPError, ValueError, TypeError):
                    self._retry_at = now + 60
                else:
                    self._models, self._fetched = models, now
                    self._retry_at = 0.0
            age = now - self._fetched if self._fetched is not None else None
            available = age is not None and age <= 86400
            return {
                "source": CATALOG_URL,
                "status": "fresh" if available and age < 3600 else "stale" if available else "unavailable",
                "fetchedAt": datetime.fromtimestamp(self._fetched, UTC).isoformat() if available else None,
                "currency": "USD",
                "priceBasis": "Catalog base token rates; additional provider charges may apply.",
                "models": copy.deepcopy(self._models) if available else [],
            }
