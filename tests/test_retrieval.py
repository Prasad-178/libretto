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


def test_natural_catalog_questions_retrieve_complete_grounded_options():
    from libretto.retrieval import RetrievalIndex

    index = RetrievalIndex.from_directory(Path("examples/knowledge"))
    for query, required in [
        (
            "I wanna book a workspace slot, basically. So how can you help me with that?",
            ["day pass", "Flex", "Resident"],
        ),
        (
            "What about memberships? What type of memberships do you have?",
            ["£220", "£360", "eight", "unlimited"],
        ),
        ("What facilities do you have?", ["Wi-Fi", "tea", "lift"]),
        (
            "Do you have dedicated meeting rooms and are they priced separately?",
            ["£18", "£32", "four", "eight"],
        ),
    ]:
        passages = index.search(query, ["company"])
        text = " ".join(p.text for p in passages)
        assert all(value in text for value in required), (query, [p.heading for p in passages])


def test_short_followups_keep_topic_but_contact_details_and_social_turns_do_not_retrieve():
    from libretto.retrieval import RetrievalIndex

    index = RetrievalIndex.from_directory(Path("examples/knowledge"))
    for query in [
        "You can call me Taylor.",
        "+1 202 555 0142",
        "Yeah, we can do that.",
        "Thanks, that's helpful.",
    ]:
        assert index.search(query, ["company"], context="How much is Loft?") == [], query
    followup = index.search("And how much does that cost?", ["company"], context="Tell me about Loft.")
    assert followup[0].heading == "Loft meeting room"


def test_price_followup_uses_room_topic_and_new_question_overrides_it():
    from libretto.retrieval import RetrievalIndex

    index = RetrievalIndex.from_directory(Path("examples/knowledge"))
    assert (
        index.search("And pricing?", ["company"], context="Tell me about Loft.")[0].heading
        == "Loft meeting room"
    )
    results = index.search("How much is a day pass?", ["company"], context="Tell me about Loft.")
    assert results[0].heading == "Day pass pricing"


def test_spoken_how_much_followup_keeps_context_without_retrieving_on_acknowledgements():
    from libretto.retrieval import RetrievalIndex

    index = RetrievalIndex.from_directory(Path("examples/knowledge"))
    for query in ["How much?", "And how much?", "How much is that?"]:
        passages = index.search(query, ["company"], context="Tell me about Loft.")
        assert passages and passages[0].heading == "Loft meeting room", query
