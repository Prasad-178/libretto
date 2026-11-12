"""Provider-aware, metadata-only voice discovery. Account data is never shared-cached."""

from datetime import UTC, datetime
from typing import Literal

import httpx
from pydantic import Field

from libretto.schema import StrictModel

CARTESIA_VOICES = "https://api.cartesia.ai/voices"
CARTESIA_GUIDE = "https://docs.livekit.io/agents/models/tts/cartesia/"
DEEPGRAM_GUIDE = "https://docs.livekit.io/agents/models/tts/deepgram/"
# Small compatible sample from LiveKit's provider docs, checked 2026-11-12.
CARTESIA_SAMPLE = (
    ("a167e0f3-df7e-4d52-a9c3-f949145efdab", "Blake", "en-US"),
    ("5c5ad5e7-1020-476b-8b91-fdcbe9cc313c", "Daniela", "es-MX"),
    ("9626c31c-bec5-4cca-baa8-f8ba9e84c8bc", "Jacqueline", "en-US"),
    ("f31cc6a7-c1e8-4764-980c-60a361443dd1", "Robyn", "en-AU"),
)
DEEPGRAM_SAMPLE = (
    ("apollo", "Apollo", "en-US"),
    ("athena", "Athena", "en-US"),
    ("odysseus", "Odysseus", "en-US"),
    ("theia", "Theia", "en-AU"),
)


class VoiceQuery(StrictModel):
    engine: Literal["livekit", "direct"] = "livekit"
    credentialMode: Literal["inference", "providers"] = "inference"
    provider: Literal["cartesia", "deepgram"]
    model: str = Field(min_length=1, max_length=100)
    query: str = Field(default="", max_length=200)
    cursor: str = Field(default="", max_length=100)


class VoiceCatalogError(ValueError):
    pass


def _result(kind, voices, guidance, source, *, cursor=None):
    return {
        "kind": kind,
        "voices": voices,
        "nextCursor": cursor,
        "guidance": guidance,
        "source": source,
        "checkedAt": datetime.now(UTC).isoformat() if kind == "account" else "2026-11-12",
    }


async def discover_voices(query: VoiceQuery, *, client: httpx.AsyncClient, key: str = "") -> dict:
    if query.engine == "direct":
        if query.provider != "deepgram" or query.model != "flux-haley-en":
            raise VoiceCatalogError("Choose a supported Direct Deepgram speech model.")
        return _result(
            "fixed",
            [],
            "This speech model includes the Haley voice; a separate voice ID is inactive.",
            DEEPGRAM_GUIDE,
        )
    if (query.provider, query.model) not in {("cartesia", "sonic-3"), ("deepgram", "aura-2")}:
        raise VoiceCatalogError("Choose a supported speech provider and model before browsing voices.")
    if query.provider == "cartesia" and query.credentialMode == "providers" and key:
        params = {"limit": 40}
        if query.query:
            params["q"] = query.query
        if query.cursor:
            params["starting_after"] = query.cursor
        try:
            response = await client.get(
                CARTESIA_VOICES,
                params=params,
                timeout=5,
                headers={"Authorization": f"Bearer {key}", "Cartesia-Version": "2026-08-14"},
            )
            response.raise_for_status()
            if len(response.content) > 1_000_000:
                raise ValueError("Voice page too large")
            payload = response.json()
            if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
                raise ValueError("Invalid voice page")
            voices = []
            for voice in payload["data"][:100]:
                if not isinstance(voice, dict) or not isinstance(voice.get("id"), str):
                    continue
                if not 0 < len(voice["id"]) <= 100 or voice.get("status", "active") != "active":
                    continue
                voices.append(
                    {
                        "id": voice["id"],
                        "name": str(voice.get("name") or voice["id"])[:200],
                        "language": str(voice.get("language") or "Not reported")[:40],
                    }
                )
            has_more = payload.get("has_more", False)
            if not isinstance(has_more, bool):
                raise ValueError("Invalid pagination state")
            cursor = payload.get("next_page") if has_more else None
            if has_more and (
                not isinstance(cursor, str) or not 0 < len(cursor) <= 100 or cursor == query.cursor
            ):
                raise ValueError("Invalid voice cursor")
            return _result(
                "account",
                voices,
                "Voices available to this Cartesia account through the direct plugin. No audio preview is generated.",
                CARTESIA_VOICES,
                cursor=cursor,
            )
        except (httpx.HTTPError, ValueError, TypeError):
            raise VoiceCatalogError(
                "Cartesia voice discovery failed. Check the session key or retry; your configured voice is preserved."
            ) from None
    sample = CARTESIA_SAMPLE if query.provider == "cartesia" else DEEPGRAM_SAMPLE
    voices = [
        {"id": vid, "name": name, "language": language}
        for vid, name, language in sample
        if query.query.lower() in f"{vid} {name} {language}".lower()
    ]
    guidance = (
        "Compatible suggestions, not the full voice library. LiveKit Inference does not support pre-existing Cartesia custom/community voices. Enter a supported default voice ID for more choices."
        if query.provider == "cartesia" and query.credentialMode == "inference"
        else "Compatible suggestions. Add a Cartesia session key in Connection to browse your account voices."
        if query.provider == "cartesia"
        else "Compatible Aura suggestions, not the full voice library. Enter another supported English voice name if needed."
    )
    return _result(
        "suggested", voices, guidance, CARTESIA_GUIDE if query.provider == "cartesia" else DEEPGRAM_GUIDE
    )
