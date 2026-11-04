import subprocess
import sys

import pytest

from libretto.providers.base import SessionCredentials
from libretto.schema import Speech


def test_default_voice_uses_livekit_inference_without_deepgram():
    config = Speech()
    assert config.engine == "livekit"
    assert config.credential_mode == "inference"
    assert config.stt.provider == "assemblyai"
    assert config.tts.provider == "cartesia"
    subprocess.run(
        [sys.executable, "-c", "import sys,libretto; assert 'livekit.agents' not in sys.modules"], check=True
    )


def test_explicit_legacy_deepgram_config_remains_direct():
    config = Speech.model_validate(
        {
            "stt": {"provider": "deepgram", "model": "flux-general-en"},
            "tts": {"provider": "deepgram", "model": "flux-haley-en"},
        }
    )
    assert config.engine == "direct"
    assert config.credential_mode == "providers"


def test_livekit_credentials_override_and_clear_without_exposure():
    original = SessionCredentials(livekit_api_key="hosted-key", livekit_api_secret="hosted-secret")
    visitor = original.with_overrides(livekit_api_key="visitor-key", livekit_api_secret="visitor-secret")
    assert visitor.key("livekit_api_secret") == "visitor-secret"
    assert visitor.public_status()["livekit_api_secret"] == "visitor"
    assert "visitor-secret" not in repr(visitor)
    assert original.key("livekit_api_secret") == "hosted-secret"
    visitor.clear()
    assert not visitor.key("livekit_api_secret")


@pytest.mark.parametrize("role,provider,model", [("stt", "shell", "execute"), ("tts", "cartesia", "missing")])
def test_livekit_configuration_rejects_unsupported_providers_and_models(role, provider, model):
    from libretto.integrations.livekit.config import validate_speech

    config = Speech()
    setattr(config, role, config.stt.model_copy(update={"provider": provider, "model": model}))
    with pytest.raises(ValueError, match="Unsupported"):
        validate_speech(config)


def test_credentials_depend_on_selected_provider_route():
    from libretto.integrations.livekit.config import required_credentials

    config = Speech()
    assert required_credentials(config) == {"livekit_api_key", "livekit_api_secret"}
    config.credential_mode = "providers"
    assert required_credentials(config) == {"assemblyai", "cartesia"}


async def test_inference_models_use_explicit_livekit_credentials_without_provider_keys():
    from libretto.integrations.livekit.models import create_models

    credentials = SessionCredentials(livekit_api_key="test-key", livekit_api_secret="test-secret")
    recognition, synthesis = create_models(Speech(), credentials)
    assert recognition.model == "assemblyai/universal-streaming"
    assert synthesis.model == "cartesia/sonic-3"
    await recognition.aclose()
    await synthesis.aclose()


def test_missing_inference_credentials_fail_before_sdk_construction():
    from libretto.integrations.livekit.models import create_models
    from libretto.providers.base import ProviderError

    with pytest.raises(ProviderError) as error:
        create_models(Speech(), SessionCredentials())
    assert error.value.code in {"missing_livekit_api_key", "missing_livekit_api_secret"}


async def test_direct_plugins_preserve_selected_models():
    from libretto.integrations.livekit.models import create_models

    config = Speech(credential_mode="providers")
    recognition, synthesis = create_models(config, SessionCredentials(assemblyai="test-a", cartesia="test-c"))
    try:
        assert recognition.model == "universal-streaming-english"
        assert synthesis.model == "sonic-3"
    finally:
        await recognition.aclose()
        await synthesis.aclose()


async def test_optional_deepgram_inference_uses_gateway_model_names():
    from libretto.integrations.livekit.models import create_models
    from libretto.schema import SpeechEndpoint

    config = Speech(
        stt=SpeechEndpoint(provider="deepgram", model="nova-3"),
        tts=SpeechEndpoint(provider="deepgram", model="aura-2"),
    )
    recognition, synthesis = create_models(
        config, SessionCredentials(livekit_api_key="test-key", livekit_api_secret="test-secret")
    )
    try:
        assert recognition.model == "deepgram/nova-3"
        assert synthesis.model == "deepgram/aura-2"
    finally:
        await recognition.aclose()
        await synthesis.aclose()
