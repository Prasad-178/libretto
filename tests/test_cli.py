from fastapi.testclient import TestClient


def test_serve_resolves_application_even_outside_the_repository(monkeypatch, tmp_path):
    import uvicorn

    from libretto.cli import main

    applications = []
    monkeypatch.setattr(uvicorn, "run", lambda app, **kwargs: applications.append(app))
    monkeypatch.setattr("sys.argv", ["libretto", "serve"])
    monkeypatch.chdir(tmp_path)
    main()
    with TestClient(applications[0]) as client:
        assert client.get("/api/health").json()["status"] == "ok"


def test_offline_evaluation_reports_source_recall_without_provider_keys(monkeypatch, tmp_path):
    import json

    from libretto.cli import main

    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    output = tmp_path / "evaluation.json"
    monkeypatch.setattr("sys.argv", ["libretto", "evaluate", "--output", str(output)])
    main()
    report = json.loads(output.read_text())
    assert report["retrieval"]["passed"]
    assert report["retrieval"]["timing"]["count"] == 8
    assert all(c["sources"] and c["passed"] for c in report["retrieval"]["cases"])
    assert "workflow" not in report
