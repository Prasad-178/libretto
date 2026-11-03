
import pytest

SOURCE = '''version: 1
id: survey
name: Survey
start: ask
shared_prompt: Ask one question.
knowledge: {docs: knowledge/missing}
common_knowledge: [docs]
nodes:
  ask:
    kind: conversation
    prompt: Ask what helps.
    edges: [{id: done, to: end, condition: The caller answered.}]
  end: {kind: end}
'''


def workspace(tmp_path):
    from libretto.workspace import StudioWorkspace

    path = tmp_path / 'survey.yaml'
    path.write_text(SOURCE)
    return StudioWorkspace(path, tmp_path, 'local-project')


def test_missing_folder_has_no_passages(tmp_path):
    w = workspace(tmp_path)
    flow, index = w.compile(SOURCE)
    assert flow.id == 'survey'
    assert index.passages == []


def test_workspace_rejects_escape_and_lists_markdown_only(tmp_path):
    w = workspace(tmp_path)
    with pytest.raises(ValueError, match='inside'):
        w.resolve_collection('../outside')
    outside = tmp_path.parent / (tmp_path.name + '-outside')
    outside.mkdir()
    (tmp_path / 'escape').symlink_to(outside, target_is_directory=True)
    with pytest.raises(ValueError, match='inside'):
        w.resolve_collection('escape')
    folder = tmp_path / 'knowledge' / 'docs'
    folder.mkdir(parents=True)
    (folder / 'reference.md').write_text('# Reference\nA useful passage.')
    (folder / 'ignored.txt').write_text('Ignored')
    (folder / 'escape.md').symlink_to(outside / 'private.md')
    (outside / 'private.md').write_text('# Private\nOutside root.')
    folders = w.list_source_folders()
    docs = next(f for f in folders if f['path'] == 'knowledge/docs')
    assert docs['markdownFiles'] == ['reference.md']
    assert set(docs['skippedFiles']) == {'ignored.txt', 'escape.md'}
    with pytest.raises(ValueError, match='inside'):
        w.compile(SOURCE.replace('knowledge/missing', 'knowledge/docs'))


def test_workspace_indexes_duplicate_collection_paths_with_separate_scope_ids(tmp_path):
    w = workspace(tmp_path)
    folder = tmp_path / 'knowledge' / 'docs'
    folder.mkdir(parents=True)
    (folder / 'reference.md').write_text('# Reference\nA useful passage.')
    source = SOURCE.replace('{docs: knowledge/missing}', '{docs: knowledge/docs, other: knowledge/docs}')
    _, index = w.compile(source)
    assert {p.source for p in index.passages} == {'docs', 'other'}


def test_hosted_workspace_rejects_unbundled_sources(tmp_path):
    from libretto.workspace import StudioWorkspace

    path = tmp_path / 'survey.yaml'
    path.write_text(SOURCE)
    w = StudioWorkspace(path, tmp_path, 'hosted-demo')
    with pytest.raises(ValueError, match='bundled'):
        w.compile(SOURCE.replace('knowledge/missing', 'elsewhere'))
