"""Small, reproducible BM25 index. No remote classifier or database is needed."""

import hashlib
import math
import re
from collections import Counter
from pathlib import Path

from libretto.state import Passage

STOP = set(
    "a an the is are was were what when where how do does can could i you we to of for and or in on it that this about my your please".split()
)


def tokens(text: str) -> list[str]:
    return [
        word[:-1] if len(word) > 4 and word.endswith("s") else word
        for word in re.findall(r"[a-z0-9]+", text.lower())
        if word not in STOP
    ]


class RetrievalIndex:
    def __init__(self, passages: list[Passage]):
        self.passages = passages
        self.terms = [Counter(tokens(p.text + " " + p.heading)) for p in passages]
        self.lengths = [sum(t.values()) for t in self.terms]
        self.average = sum(self.lengths) / max(len(passages), 1)
        self.frequency = Counter(word for counter in self.terms for word in counter)

    @classmethod
    def from_directory(cls, path: Path, source: str = "company") -> "RetrievalIndex":
        passages = []
        for document in sorted(path.glob("*.md")):
            heading = document.stem
            for index, section in enumerate(re.split(r"(?m)^#{1,3} ", document.read_text())):
                if not section.strip():
                    continue
                lines = section.strip().splitlines()
                heading = lines[0]
                text = "\n".join(lines[1:]).strip()
                if not text:
                    continue
                for offset in range(0, len(text), 1400):
                    chunk = text[offset : offset + 1400]
                    digest = hashlib.sha256(chunk.encode()).hexdigest()[:16]
                    passages.append(
                        Passage(
                            source,
                            document.name,
                            heading,
                            f"{document.stem}-{index}-{offset}",
                            digest,
                            chunk,
                            0.0,
                        )
                    )
        return cls(passages)

    def search(self, query: str, sources: list[str], limit: int = 3) -> list[Passage]:
        from dataclasses import replace

        terms = set(tokens(query[-1600:]))
        ranked = []
        for index, passage in enumerate(self.passages):
            if passage.source not in sources:
                continue
            score = 0.0
            for word in terms:
                count = self.terms[index].get(word, 0)
                if not count:
                    continue
                df, total = self.frequency[word], len(self.passages)
                idf = math.log(1 + (total - df + 0.5) / (df + 0.5))
                denominator = count + 1.2 * (0.25 + 0.75 * self.lengths[index] / max(self.average, 1))
                score += idf * count * 2.2 / denominator
            if score > 0:
                ranked.append(replace(passage, score=round(score, 5)))
        return sorted(ranked, key=lambda p: p.score, reverse=True)[: max(0, min(limit, 5))]


def build_index(workflow, base: Path) -> RetrievalIndex:
    passages = []
    for source, relative in workflow.knowledge.items():
        directory = (base / relative).resolve()
        if not directory.is_relative_to(base.resolve()):
            raise ValueError("Knowledge paths must remain inside the examples directory")
        passages.extend(RetrievalIndex.from_directory(directory, source).passages)
    return RetrievalIndex(passages)
