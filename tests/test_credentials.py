def test_key_overrides_are_redacted_and_do_not_mutate_hosted_defaults():
    from libretto.providers.base import SessionCredentials

    hosted = SessionCredentials(openrouter="hosted-openrouter", deepgram="hosted-deepgram")
    visitor = hosted.with_overrides(openrouter="visitor-openrouter")
    assert visitor.key("openrouter") == "visitor-openrouter"
    assert hosted.key("openrouter") == "hosted-openrouter"
    assert visitor.key("deepgram") == "hosted-deepgram"
    assert "visitor-openrouter" not in repr(visitor)
    assert "hosted-deepgram" not in str(visitor.public_status())
    assert visitor.public_status()["openrouter"] == "visitor"
    visitor.clear()
    assert visitor.key("openrouter") == ""
