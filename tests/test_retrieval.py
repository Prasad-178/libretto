from pathlib import Path


def test_weekend_followup_retrieves_support_hours_and_source(tmp_path):
    from libretto.retrieval import RetrievalIndex

    (tmp_path / "support.md").write_text(
        "# Support hours\nSupport is open weekdays. On weekends, Saturday and Sunday, support is closed."
    )
    (tmp_path / "pricing.md").write_text("# Pricing\nAnnual software subscriptions are invoiced monthly.")
    index = RetrievalIndex.from_directory(tmp_path)
    results = index.search("support hours what about weekends", ["company"], 3)
    assert results[0].document == "support.md"
    assert "closed" in results[0].text
    assert results[0].chunk_id and results[0].content_hash
    assert index.search("support hours", ["unavailable"], 3) == []


def test_unmatched_question_returns_no_passages(tmp_path):
    from libretto.retrieval import RetrievalIndex

    (tmp_path / "hours.md").write_text("# Hours\nOpen Monday through Friday.")
    assert RetrievalIndex.from_directory(tmp_path).search("volcano insurance", ["company"], 3) == []


def test_shared_prompt_and_stage_instructions_survive_retrieval():
    from libretto.prompts import compose_prompt
    from libretto.schema import load_workflow
    from libretto.state import StageSnapshot

    flow = load_workflow(Path("examples/receptionist.yaml"))
    context = compose_prompt(flow, StageSnapshot("take_message", 0, 1, {}, ()), [])
    assert flow.shared_prompt in context.system
    assert flow.nodes["take_message"].prompt in context.system
    assert flow.nodes["confirm_transfer"].prompt not in context.system
