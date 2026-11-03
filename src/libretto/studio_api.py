"""Read-only Studio inspection uses the exact session retrieval implementation."""

import hashlib
from dataclasses import asdict

from pydantic import Field

from libretto.retrieval import tokens
from libretto.schema import StrictModel


class SourceRequest(StrictModel):
    source: str = Field(max_length=100_000)


class RetrievalRequest(SourceRequest):
    stepId: str = Field(min_length=1, max_length=200)
    query: str = Field(max_length=8000)
    limit: int = Field(default=3, ge=1, le=3)


def fingerprint(source: str) -> str:
    return hashlib.sha256(source.encode()).hexdigest()


def inspect_sources(workspace, source: str) -> dict:
    workflow, index = workspace.compile(source)
    collections, warnings = [], []
    for source_id, relative in workflow.knowledge.items():
        directory = workspace.resolve_collection(relative)
        missing = not directory.is_dir()
        documents = []
        for path in sorted(directory.glob('*.md')):
            if path.is_file():
                documents.append({'name': path.name, 'bytes': path.stat().st_size,
                                  'passages': [asdict(p) for p in index.passages
                                               if p.source == source_id and p.document == path.name]})
        collections.append({'id': source_id, 'path': relative, 'missing': missing,
                            'scope': {'allSteps': source_id in workflow.common_knowledge,
                                      'stepIds': [node_id for node_id, node in workflow.nodes.items()
                                                  if source_id in node.knowledge]},
                            'documents': documents})
        if missing:
            warnings.append({'code': 'missing_source', 'sourceId': source_id, 'path': relative,
                             'message': f'Source folder {relative} is missing; no passages indexed.'})
    return {'sourceFingerprint': fingerprint(source), 'collections': collections, 'warnings': warnings}


def preview_retrieval(workspace, source: str, step_id: str, query: str, limit: int) -> dict:
    workflow, index = workspace.compile(source)
    if step_id not in workflow.nodes:
        raise ValueError(f'Unknown step {step_id}')
    effective = list(dict.fromkeys(workflow.common_knowledge + workflow.nodes[step_id].knowledge))
    return {'sourceFingerprint': fingerprint(source), 'stepId': step_id, 'query': query,
            'limit': limit, 'effectiveSources': effective, 'terms': tokens(query[-1600:]),
            'passages': [asdict(p) for p in index.search(query, effective, limit)]}


class PassageEvidence(StrictModel):
    source: str
    document: str
    heading: str
    chunk_id: str
    content_hash: str
    text: str
    score: float


class SourceScope(StrictModel):
    allSteps: bool
    stepIds: list[str]


class SourceDocument(StrictModel):
    name: str
    bytes: int
    passages: list[PassageEvidence]


class SourceCollection(StrictModel):
    id: str
    path: str
    missing: bool
    scope: SourceScope
    documents: list[SourceDocument]


class SourceWarning(StrictModel):
    code: str
    sourceId: str
    path: str
    message: str


class SourceManifest(StrictModel):
    sourceFingerprint: str
    collections: list[SourceCollection]
    warnings: list[SourceWarning]


class RetrievalPreview(StrictModel):
    sourceFingerprint: str
    stepId: str
    query: str
    limit: int
    effectiveSources: list[str]
    terms: list[str]
    passages: list[PassageEvidence]
