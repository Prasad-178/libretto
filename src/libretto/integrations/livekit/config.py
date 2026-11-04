"""Bounded speech choices independent of LiveKit's optional SDK imports."""

from libretto.schema import Speech

MODELS = {
    "stt": {"assemblyai": ("universal-streaming",), "deepgram": ("nova-3",)},
    "tts": {"cartesia": ("sonic-3",), "deepgram": ("aura-2",)},
}


def validate_speech(config: Speech) -> None:
    for role in ("stt", "tts"):
        endpoint = getattr(config, role)
        if endpoint.model not in MODELS[role].get(endpoint.provider, ()):
            raise ValueError(
                f"Unsupported {role.upper()} provider/model: {endpoint.provider}/{endpoint.model}"
            )
    if config.tts.provider == "cartesia" and not config.tts.voice:
        raise ValueError("Choose a Cartesia voice ID")


def required_credentials(config: Speech) -> set[str]:
    validate_speech(config)
    if config.credential_mode == "inference":
        return {"livekit_api_key", "livekit_api_secret"}
    return {config.stt.provider, config.tts.provider}
