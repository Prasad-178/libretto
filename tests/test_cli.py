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
