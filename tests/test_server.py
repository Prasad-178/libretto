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


def test_yaml_source_route_returns_the_same_public_workflow():
    from libretto.server import create_app

    with TestClient(create_app(load_environment=False)) as client:
        response = client.get("/api/workflow.yaml")
        assert response.status_code == 200
        assert "northline-receptionist" in response.text
        assert "shared_prompt:" in response.text


def test_deployment_entrypoint_uses_explicit_asset_root(monkeypatch, tmp_path):
    import shutil
    from pathlib import Path

    from libretto.server import create_app

    source = Path(__file__).resolve().parents[1]
    shutil.copytree(source / "examples", tmp_path / "examples")
    (tmp_path / "public").mkdir()
    (tmp_path / "public/index.html").write_text("deployment frontend")
    monkeypatch.chdir("/")
    with TestClient(create_app(load_environment=False, asset_root=tmp_path)) as client:
        assert client.get("/").text == "deployment frontend"
        assert client.get("/api/config").status_code == 200


def test_frontend_route_survives_build_after_app_discovery(tmp_path):
    import shutil
    from pathlib import Path

    from libretto.server import create_app

    shutil.copytree(Path(__file__).resolve().parents[1] / "examples", tmp_path / "examples")
    app = create_app(load_environment=False, asset_root=tmp_path)
    (tmp_path / "public").mkdir()
    (tmp_path / "public/index.html").write_text("built after discovery")
    with TestClient(app) as client:
        assert client.get("/").text == "built after discovery"
