import asyncio

from fastapi.testclient import TestClient


def test_vercel_defaults_to_visitor_keys_even_with_accidental_hosted_keys(monkeypatch):
    from libretto.server import create_app

    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("OPENROUTER_API_KEY", "PRIVATE-OR")
    monkeypatch.setenv("DEEPGRAM_API_KEY", "PRIVATE-DG")
    monkeypatch.delenv("LIBRETTO_ALLOW_HOSTED_KEYS", raising=False)
    called = []

    def factory(*a, **kw):
        called.append(True)
        raise AssertionError("Keyless connection must not instantiate a provider")

    with TestClient(create_app(load_environment=False, model_factory=factory)) as client:
        config = client.get("/api/config").json()
        assert config["credentials"] == {"openrouter": "missing", "deepgram": "missing"}
        assert config["credential_mode"] == "visitor"
        for mode in ("text", "voice"):
            with client.websocket_connect("/api/ws") as ws:
                ws.send_json({"type": "start", "mode": mode})
                assert ws.receive_json()["data"]["code"] == "missing_openrouter_key"
        assert not called


def test_hosted_budget_requires_explicit_operator_opt_in_on_vercel(monkeypatch):
    from libretto.server import create_app

    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("LIBRETTO_ALLOW_HOSTED_KEYS", "true")
    monkeypatch.setenv("OPENROUTER_API_KEY", "PRIVATE-OR")
    with TestClient(create_app(load_environment=False)) as client:
        config = client.get("/api/config")
        assert config.json()["credentials"]["openrouter"] == "hosted"
        assert config.json()["credential_mode"] == "hosted"
        assert "PRIVATE-OR" not in config.text


def test_request_budget_allows_human_bursts_and_refills_without_resetting():
    import libretto.server as module

    assert hasattr(module, "RequestBudget"), "Costly events need a per-connection budget"
    budget = module.RequestBudget()
    assert all(budget.accept(10) for _ in range(3))
    assert not budget.accept(10)
    assert not budget.accept(10.5)
    assert budget.accept(11)
    assert not budget.accept(11)


async def test_idle_connection_is_closed_before_any_session_or_provider(monkeypatch):
    import libretto.server as module

    monkeypatch.setattr(module, "START_TIMEOUT_SECONDS", 0.01, raising=False)
    packets, closed = [], []

    class Socket:
        headers = {}

        async def accept(self):
            pass

        async def receive(self):
            await asyncio.Event().wait()

        async def send_json(self, value):
            packets.append(value)

        async def close(self, **kwargs):
            closed.append(kwargs)

    app = module.create_app(load_environment=False)
    handler = next(r.endpoint for r in app.routes if getattr(r, "path", "") == "/api/ws")
    async with app.router.lifespan_context(app):
        await asyncio.wait_for(handler(Socket()), 0.2)
    assert any(p["type"] == "error" and p["data"]["code"] == "start_timeout" for p in packets)
    assert closed


async def test_oversized_binary_frame_closes_connection_without_provider():
    from libretto.server import create_app

    packets, closed = [], []

    class Socket:
        headers = {}

        def __init__(self):
            self.frames = iter(
                [{"type": "websocket.receive", "bytes": b"a" * 8193}, {"type": "websocket.disconnect"}]
            )

        async def accept(self):
            pass

        async def receive(self):
            return next(self.frames)

        async def send_json(self, value):
            packets.append(value)

        async def close(self, **kwargs):
            closed.append(kwargs)

    app = create_app(load_environment=False)
    handler = next(r.endpoint for r in app.routes if getattr(r, "path", "") == "/api/ws")
    async with app.router.lifespan_context(app):
        await asyncio.wait_for(handler(Socket()), 0.2)
    assert any(p["data"].get("code") == "message_limit" for p in packets)
    assert any(c.get("code") == 1009 for c in closed)


def test_visitor_credentials_cannot_be_reused_by_the_next_connection(monkeypatch):
    from libretto.server import create_app
    from libretto.state import Evaluation

    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.delenv("LIBRETTO_ALLOW_HOSTED_KEYS", raising=False)
    captured = []

    class Model:
        async def evaluate(self, context):
            return Evaluation()

        async def stream_reply(self, context):
            yield "Hello."

        async def close(self):
            pass

    def factory(credentials, *args, **kwargs):
        captured.append(credentials)
        return Model()

    with TestClient(create_app(load_environment=False, model_factory=factory)) as client:
        with client.websocket_connect("/api/ws") as ws:
            ws.send_json({"type": "start", "mode": "text", "openrouter_key": "visitor-only-test"})
            ready = ws.receive_json()
            assert ready["type"] == "ready"
            assert "visitor-only-test" not in str(ready)
            ws.send_json({"type": "close"})
        with client.websocket_connect("/api/ws") as ws:
            ws.send_json({"type": "start", "mode": "text"})
            assert ws.receive_json()["data"]["code"] == "missing_openrouter_key"
        assert len(captured) == 1
        assert captured[0].key("openrouter") == ""


def test_voice_cannot_create_any_provider_without_selected_speech_credentials(monkeypatch):
    from libretto.server import create_app

    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.delenv("LIBRETTO_ALLOW_HOSTED_KEYS", raising=False)
    called = []

    def factory(*args, **kwargs):
        called.append(True)
        raise AssertionError("Speech key gate must run before creating model providers")

    with TestClient(create_app(load_environment=False, model_factory=factory)) as client:
        with client.websocket_connect("/api/ws") as ws:
            ws.send_json({"type": "start", "mode": "voice", "openrouter_key": "placeholder-only"})
            assert ws.receive_json()["data"]["code"] == "missing_deepgram_key"
        assert not called
