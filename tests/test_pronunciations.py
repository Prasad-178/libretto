"""Literal streaming replacements affect synthesis, never workflow authority."""

import pytest
from pydantic import ValidationError

from libretto.schema import Speech


def rules(*pairs):
    return Speech(pronunciations=[{"word": word, "say_as": spoken} for word, spoken in pairs]).pronunciations


@pytest.mark.parametrize(
    "source,expected,pairs",
    [
        ("Hello.", "Hello.", ()),
        (
            "Libretto, Librettos and libretto.",
            "lih-BRET-oh, Librettos and libretto.",
            (("Libretto", "lih-BRET-oh"),),
        ),
        ("New York and New.", "NYC and fresh.", (("New", "fresh"), ("New York", "NYC"))),
        ("SQL nginx", "nginx engine x", (("SQL", "nginx"), ("nginx", "engine x"))),
        (
            "Élodie, 你好! Élodiex.",
            "ell-oh-dee, hello! Élodiex.",
            (("Élodie", "ell-oh-dee"), ("你好", "hello")),
        ),
        ("A.* and xA.*", "literal and xA.*", (("A.*", "literal"),)),
    ],
)
def test_replacements_are_identical_across_every_chunk_boundary(source, expected, pairs):
    from libretto.pronunciations import PronunciationStream

    for boundary in range(len(source) + 1):
        stream = PronunciationStream(rules(*pairs))
        assert stream.feed(source[:boundary]) + stream.feed(source[boundary:]) + stream.finish() == expected
    stream = PronunciationStream(rules(*pairs))
    assert "".join(stream.feed(char) for char in source) + stream.finish() == expected


def test_empty_rules_stream_without_delay_and_pending_matches_flush():
    from libretto.pronunciations import PronunciationStream

    assert PronunciationStream([]).feed("Hello") == "Hello"
    stream = PronunciationStream(rules(("Libretto", "lih-BRET-oh")))
    assert stream.feed("Libr") == ""
    assert stream.finish() == "Libr"


def test_spoken_prefix_maps_back_to_original_without_claiming_partial_replacements():
    from libretto.pronunciations import PronunciationStream

    stream = PronunciationStream(rules(("SQL", "sequel")))
    assert stream.feed("Use SQL today.") + stream.finish() == "Use sequel today."
    assert stream.original_prefix("Use seq") == "Use "
    assert stream.original_prefix("Use sequel to") == "Use SQL to"
    assert stream.original_prefix("Unexpected provider normalization") == ""


@pytest.mark.parametrize(
    "rows",
    [
        [{"word": "", "say_as": "x"}],
        [{"word": "x", "say_as": " "}],
        [{"word": "x", "say_as": "a"}, {"word": "x", "say_as": "b"}],
        [{"word": "x", "say_as": "a"}, {"word": "x", "say_as": "a"}],
        [{"word": "x" * 101, "say_as": "a"}],
        [{"word": "x", "say_as": "a" * 201}],
    ],
)
def test_schema_rejects_ambiguous_or_unbounded_rules(rows):
    with pytest.raises(ValidationError, match="pronunciations"):
        Speech(pronunciations=rows)


def test_schema_preserves_typed_rules_and_omitted_rules_remain_empty():
    assert Speech().pronunciations == []
    config = Speech(pronunciations=[{"word": "Libretto", "say_as": "lih-BRET-oh"}])
    assert config.pronunciations[0].word == "Libretto"
    assert config.model_dump()["pronunciations"] == [{"word": "Libretto", "say_as": "lih-BRET-oh"}]


def test_unicode_combining_marks_are_word_characters_and_rules_are_literal():
    from libretto.pronunciations import PronunciationStream

    stream = PronunciationStream(rules(("Elodie", "ell-oh-dee")))
    text = "Elodie\u0301 Elodie"
    assert "".join(stream.feed(char) for char in text) + stream.finish() == "Elodie\u0301 ell-oh-dee"
