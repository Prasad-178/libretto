from pathlib import Path

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


def test_serve_uses_explicit_workflow_and_project_root(monkeypatch, tmp_path):
    import uvicorn

    from libretto.cli import main

    source = Path('examples/minimal.yaml').read_text()
    path = tmp_path / 'survey.yaml'
    path.write_text(source)
    applications = []
    monkeypatch.setattr(uvicorn, 'run', lambda app, **kwargs: applications.append(app))
    monkeypatch.setattr('sys.argv', ['libretto', 'serve', str(path), '--project-root', str(tmp_path)])
    main()
    with TestClient(applications[0]) as client:
        assert client.get('/api/config').json()['workflow']['id'] == 'tiny-survey'
        assert client.get('/api/workflow.yaml').text == source


def test_validate_rejects_missing_application_handler(monkeypatch, tmp_path, capsys):
    import pytest
    from test_action_lifecycle import SOURCE

    from libretto.cli import main
    path=tmp_path/'agent.yaml'
    path.write_text(SOURCE)
    monkeypatch.setattr('sys.argv',['libretto','validate',str(path)])
    with pytest.raises(SystemExit) as error:
        main()
    assert error.value.code==1
    assert 'unregistered_tool' in capsys.readouterr().out


def test_validate_formats_invalid_schema_without_traceback(monkeypatch, tmp_path, capsys):
    import pytest

    from libretto.cli import main
    path = tmp_path / 'invalid.yaml'
    path.write_text('version: 1\nid: broken\n')
    monkeypatch.setattr('sys.argv', ['libretto', 'validate', str(path)])
    with pytest.raises(SystemExit) as error:
        main()
    assert error.value.code == 1
    assert 'name [missing]' in capsys.readouterr().out
