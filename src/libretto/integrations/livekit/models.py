"""Explicit SDK/plugin construction; no credentials are inferred from globals."""

from libretto.providers.base import ProviderError, SessionCredentials
from libretto.schema import Speech

from .config import required_credentials


def create_models(config: Speech, credentials: SessionCredentials):
    for name in required_credentials(config):
        if not credentials.key(name):
            raise ProviderError(f"missing_{name}", f"Add {name.replace('_', ' ')} in Connection settings.")
    try:
        if config.credential_mode == "inference":
            from livekit.agents import inference

            auth = {
                "api_key": credentials.key("livekit_api_key"),
                "api_secret": credentials.key("livekit_api_secret"),
            }
            recognition = inference.STT(
                model=f"{config.stt.provider}/{config.stt.model}", sample_rate=16000, **auth
            )
            options = {"voice": config.tts.voice} if config.tts.voice else {}
            synthesis = inference.TTS(
                model=f"{config.tts.provider}/{config.tts.model}", sample_rate=24000, **options, **auth
            )
            return recognition, synthesis
        from livekit.plugins import assemblyai, cartesia, deepgram

        if config.stt.provider == "assemblyai":
            recognition = assemblyai.STT(
                model="universal-streaming-english", api_key=credentials.key("assemblyai")
            )
        else:
            recognition = deepgram.STT(model=config.stt.model, api_key=credentials.key("deepgram"))
        if config.tts.provider == "cartesia":
            synthesis = cartesia.TTS(
                model=config.tts.model,
                voice=config.tts.voice,
                api_key=credentials.key("cartesia"),
                sample_rate=24000,
            )
        else:
            synthesis = deepgram.TTS(
                model=f"aura-2-{config.tts.voice or 'athena'}-en",
                api_key=credentials.key("deepgram"),
                sample_rate=24000,
            )
        return recognition, synthesis
    except ImportError as error:
        raise ProviderError(
            "livekit_not_installed",
            "Install libretto-voice[studio] or libretto-voice[livekit] to use LiveKit voice.",
        ) from error
