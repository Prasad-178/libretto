"""Literal pronunciation rules at the synthesis boundary, independent of providers."""

import unicodedata
from collections.abc import Sequence

from libretto.schema import Pronunciation


def _word_character(char: str) -> bool:
    # Include combining marks so decomposed Unicode names stay one word.
    return bool(char) and (char == "_" or unicodedata.category(char)[0] in "LNM")


class PronunciationStream:
    """Replace longest literal terms without depending on token chunk boundaries.

    Only a still-possible match is buffered, at most the longest configured term
    plus its boundary. Replacement output is never searched again. The source
    mapping conservatively recovers heard original text after an interruption.
    """

    def __init__(self, rules: Sequence[Pronunciation]):
        self._rules = sorted(((r.word, r.say_as) for r in rules), key=lambda r: -len(r[0]))
        self._pending = ""
        self._previous = ""
        self._segments: list[tuple[str, str]] = []

    def feed(self, text: str) -> str:
        self._pending += text
        return self._drain(final=False)

    def finish(self) -> str:
        return self._drain(final=True)

    def _drain(self, *, final: bool) -> str:
        result = []
        while self._pending:
            match = None
            if not _word_character(self._previous):
                for word, spoken in self._rules:
                    if self._pending.startswith(word):
                        if len(self._pending) == len(word) and not final:
                            return "".join(result)
                        following = self._pending[len(word) : len(word) + 1]
                        if not _word_character(following):
                            match = word, spoken
                            break
                    elif not final and word.startswith(self._pending):
                        return "".join(result)
            original, spoken = match or (self._pending[0], self._pending[0])
            self._segments.append((original, spoken))
            result.append(spoken)
            self._previous = original[-1]
            self._pending = self._pending[len(original) :]
        return "".join(result)

    def original_prefix(self, spoken: str) -> str:
        """Do not claim an entire original term if only part of its replacement played."""
        if not "".join(output for _, output in self._segments).startswith(spoken):
            return ""
        remaining = len(spoken)
        result = []
        for original, output in self._segments:
            if remaining >= len(output):
                result.append(original)
                remaining -= len(output)
            else:
                if original == output:
                    result.append(original[:remaining])
                break
        return "".join(result)
