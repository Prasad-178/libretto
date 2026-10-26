from fastapi.testclient import TestClient


def test_public_config_exposes_workflow_but_never_hosted_credentials(monkeypatch):
    from libretto.server import create_app

    monkeypatch.setenv("OPENROUTER_API_KEY", "PRIVATE-HOSTED-KEY")
    with TestClient(create_app()) as client:
        result = client.get("/api/config")
        assert result.status_code == 200
        assert result.json()["workflow"]["id"] == "northline-receptionist"
        assert "PRIVATE-HOSTED-KEY" not in result.text
        assert result.json()["call_limit_seconds"] == 180


def test_missing_key_yields_actionable_status_and_no_fake_response(monkeypatch):
    from libretto.server import create_app

    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with TestClient(create_app(load_environment=False)) as client:
        with client.websocket_connect("/api/ws") as ws:
            ws.send_json({"type": "start", "mode": "text"})
            packet = ws.receive_json()
            assert packet["type"] == "error"
            assert packet["data"]["code"] == "missing_openrouter_key"


def test_real_runtime_is_driven_through_one_websocket_with_injected_provider():
    from libretto.server import create_app
    from libretto.state import Evaluation

    class Model:
        async def evaluate(self, context):
            return Evaluation()

        async def stream_reply(self, context):
            yield "Support is closed on weekends."

        async def close(self):
            pass

    with TestClient(
        create_app(load_environment=False, model_factory=lambda *args, **kwargs: Model())
    ) as client:
        with client.websocket_connect("/api/ws") as ws:
            ws.send_json({"type": "start", "mode": "text", "openrouter_key": "visitor-test"})
            assert ws.receive_json()["type"] == "ready"
            ws.send_json({"type": "text", "text": "Is support open on weekends?", "turn_id": "t1"})
            packets = []
            while True:
                packet = ws.receive_json()
                packets.append(packet)
                if packet["type"] == "response_done":
                    break
            assert any(p["type"] == "retrieval" and p["data"]["passages"] for p in packets)
            assert any(p["type"] == "text_delta" and "weekends" in p["data"]["text"] for p in packets)
            assert "visitor-test" not in str(packets)
            ws.send_json({"type": "close"})
