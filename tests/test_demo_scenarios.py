import json
from pathlib import Path

from fastapi.testclient import TestClient


def test_curated_scenarios_are_public_fictional_and_cover_failure_paths():
    from libretto.server import create_app

    with TestClient(create_app(load_environment=False)) as client:
        config = client.get("/api/config").json()
    assert "test_scenarios" in config, "Demo needs guided fictional test cases"
    scenarios = config["test_scenarios"]
    assert len(scenarios) >= 12
    assert len({s["id"] for s in scenarios}) == len(scenarios)
    assert {s["transfer_outcome"] for s in scenarios} >= {"connected", "unavailable", "failed", "timeout"}
    for scenario in scenarios:
        assert scenario["fictional"] is True
        assert scenario["steps"] and scenario["checks"]
        assert scenario["steps"][0]["say"] == scenario["opening"]
        assert all(step["say"] and step["expect"] for step in scenario["steps"])
        assert all(
            name in {"company.md", "support.md", "memberships.md", "rooms.md"}
            for name in scenario["expected_sources"]
        )
        if scenario.get("caller"):
            assert scenario["caller"]["phone"].startswith("+1 202 555 01")


def test_business_reference_answers_are_grounded_in_bundled_fake_data():
    from libretto.retrieval import build_index
    from libretto.schema import load_workflow

    flow = load_workflow(Path("examples/receptionist.yaml"))
    index = build_index(flow, Path("examples"))
    for question, document, needle in [
        ("How much is a day pass?", "memberships.md", "£25"),
        ("What does the Flex membership include?", "memberships.md", "£220"),
        ("How much does the Loft meeting room cost per hour?", "rooms.md", "£32"),
        ("Can I cancel a meeting room booking with 24 hours notice?", "rooms.md", "24 hours"),
        ("Is support open on weekends?", "support.md", "closed"),
    ]:
        passages = index.search(question, ["company"], 3)
        assert any(p.document == document and needle in p.text for p in passages), question
    assert "coworking" in flow.shared_prompt.lower()


def test_scenario_fixtures_do_not_contain_provider_credentials():
    path = Path("examples/test-scenarios.json")
    assert path.exists(), "Curated scenarios must be bundled reproducibly"
    text = path.read_text()
    assert not any(token in text.lower() for token in ("sk-or-v1-", "api_key", "authorization"))
    assert isinstance(json.loads(text), list)


async def test_scripted_followups_receive_current_question_facts_in_real_runtime_prompts():
    from test_runtime import Evaluator, next_event

    from libretto.retrieval import build_index
    from libretto.runtime import Session
    from libretto.schema import load_workflow
    from libretto.tools import ToolRegistry

    fixtures = {s["id"]: s for s in json.loads(Path("examples/test-scenarios.json").read_text())}
    flow = load_workflow(Path("examples/receptionist.yaml"))
    for scenario_id, expected in [("room-policy", "24 hours"), ("side-question", "£32")]:
        contexts = []

        class Speaker:
            async def stream_reply(self, context):
                contexts.append(context)
                yield "Controlled test response."

        session = Session(flow, Speaker(), Evaluator(), build_index(flow, Path("examples")), ToolRegistry())
        try:
            for i, step in enumerate(fixtures[scenario_id]["steps"][:2]):
                await session.submit_turn(step["say"], f"{scenario_id}-{i}")
                await next_event(session, "response_done")
            assert expected in contexts[-1].system, scenario_id
            assert len(contexts[-1].passages) <= 3
        finally:
            await session.close()
