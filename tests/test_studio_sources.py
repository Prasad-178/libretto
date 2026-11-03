import hashlib
from dataclasses import asdict
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from libretto.server import create_app


@pytest.fixture
def local_project(tmp_path):
    source = Path('examples/minimal.yaml').read_text().replace('nodes:', 'knowledge: {common: common, accounts: accounts, unrelated: unrelated, missing: absent}\ncommon_knowledge: [common]\nnodes:').replace('    title: One question', '    knowledge: [accounts, common]\n    title: One question')
    for name in ['common', 'accounts', 'unrelated']:
        folder = tmp_path / name
        folder.mkdir()
        (folder / 'guide.md').write_text(f'# {name}\nBilling policies for {name}.')
    path = tmp_path / 'survey.yaml'
    path.write_text(source)
    return tmp_path, path, source


def test_sources_and_preview_use_real_index_and_effective_scope(local_project):
    root, path, source = local_project
    app = create_app(workflow_path=path, project_root=root, load_environment=False)
    with TestClient(app) as client:
        manifest = client.post('/api/studio/sources', json={'source': source})
        assert manifest.status_code == 200
        data = manifest.json()
        assert data['sourceFingerprint'] == hashlib.sha256(source.encode()).hexdigest()
        assert data['warnings'][0]['sourceId'] == 'missing'
        response = client.post('/api/studio/retrieval', json={'source': source, 'stepId': 'question', 'query': 'billing', 'limit': 3})
        assert response.status_code == 200
        preview = response.json()
        assert preview['effectiveSources'] == ['common', 'accounts']
        assert preview['terms'] == ['billing']
        _, index = app.state.studio_workspace.compile(source)
        assert preview['passages'] == [asdict(p) for p in index.search('billing', ['common', 'accounts'], 3)]
        assert client.post('/api/studio/retrieval', json={'source': source, 'stepId': 'missing', 'query': 'billing'}).status_code == 422
        capabilities = client.get('/api/studio/capabilities').json()
        assert capabilities['mode'] == 'local-project'
        assert {t['name'] for t in capabilities['tools']} == {'capture_message', 'transfer_call'}
        assert client.get('/api/studio/source-folders').status_code == 200
        assert 'credentials' not in capabilities


def test_hosted_sources_remain_bundled_and_preview_matches_runtime():
    app = create_app(load_environment=False)
    source = Path('examples/receptionist.yaml').read_text()
    with TestClient(app) as client:
        assert client.get('/api/studio/source-folders').status_code == 403
        result = client.post('/api/studio/retrieval', json={'source': source, 'stepId': 'faq', 'query': 'Dock room'})
        assert result.status_code == 200
        _, index = app.state.studio_workspace.compile(source)
        assert result.json()['passages'] == [asdict(p) for p in index.search('Dock room', ['company'], 3)]
