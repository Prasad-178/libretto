from pathlib import Path

import pytest

MINIMAL = """
version: 1
id: tiny
name: Tiny survey
start: question
shared_prompt: Speak English.
fields:
  answer: {type: string}
nodes:
  question:
    kind: conversation
    prompt: Ask one question.
    edges:
      - {id: done, to: end, condition: The user has answered.}
  end: {kind: end}
"""


def load(text: str, tmp_path: Path):
    from libretto.schema import load_workflow

    path = tmp_path / "flow.yaml"
    path.write_text(text)
    return load_workflow(path)


def test_loads_graph_unrelated_to_receptionist(tmp_path):
    flow = load(MINIMAL, tmp_path)
    assert flow.start == "question"
    assert flow.nodes["question"].edges[0].to == "end"


def test_duplicate_yaml_keys_are_rejected(tmp_path):
    with pytest.raises(ValueError, match="duplicate"):
        load(MINIMAL.replace("id: tiny", "id: tiny\nid: overwritten"), tmp_path)


@pytest.mark.parametrize(
    "before,after,error",
    [
        ("version: 1", "version: 7", "version"),
        ("to: end", "to: missing", "missing"),
        ("prompt: Ask one question.", "prompt: Ask one question.\n    tools: [unbound]", "unbound"),
        ("prompt: Ask one question.", "prompt: Ask one question.\n    knowledge: [secret]", "secret"),
        ("condition: The user has answered.", "predicate: {op: exec, field: answer}", "op"),
    ],
)
def test_invalid_workflows_fail_before_accepting_a_call(tmp_path, before, after, error):
    with pytest.raises(ValueError, match=error):
        load(MINIMAL.replace(before, after), tmp_path)


def test_unknown_top_level_configuration_is_rejected(tmp_path):
    with pytest.raises(ValueError, match="surprise"):
        load(MINIMAL + "surprise: true\n", tmp_path)


def test_receptionist_example_is_executable():
    from libretto.schema import load_workflow

    flow = load_workflow(Path('examples/receptionist.yaml'))
    assert flow.nodes['transfer'].tool == 'transfer_call'
    assert flow.nodes['save_message'].requires == [
        'recipient', 'caller_name', 'callback_number', 'message', 'message_consent', 'message_confirmed'
    ]
