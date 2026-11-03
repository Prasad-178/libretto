"""Explicit project capability and bounded, read-only workflow compilation."""

import os
from pathlib import Path
from typing import Literal

from libretto.retrieval import build_index
from libretto.schema import load_workflow, parse_workflow


class StudioWorkspace:
    def __init__(self, workflow_path: Path, project_root: Path,
                 mode: Literal['hosted-demo', 'local-project']):
        self.workflow_path = workflow_path.resolve()
        self.project_root = project_root.resolve()
        self.mode = mode
        if not self.workflow_path.is_relative_to(self.project_root):
            raise ValueError('Workflow must remain inside the configured project root')
        self.workflow = load_workflow(self.workflow_path)
        self.bundled_paths = set(self.workflow.knowledge.values())

    def resolve_collection(self, relative: str) -> Path:
        if Path(relative).is_absolute() or '..' in Path(relative).parts:
            raise ValueError('Knowledge paths must remain inside the configured project root')
        directory = (self.project_root / relative).resolve()
        if not directory.is_relative_to(self.project_root):
            raise ValueError('Knowledge paths must remain inside the configured project root')
        return directory

    def list_source_folders(self) -> list[dict]:
        if self.mode != 'local-project':
            raise ValueError('Run libretto serve workflow.yaml --project-root . to select local folders')
        folders = []
        for directory, children, names in os.walk(self.project_root, followlinks=False):
            children[:] = sorted(name for name in children if not name.startswith('.')
                                 and name not in {'node_modules', '__pycache__'}
                                 and not (Path(directory) / name).is_symlink())
            markdown, skipped = [], []
            for name in sorted(names):
                path = Path(directory) / name
                if path.suffix == '.md' and path.is_file() and not path.is_symlink():
                    markdown.append(name)
                else:
                    skipped.append(name)
            if markdown:
                folders.append({'path': Path(directory).relative_to(self.project_root).as_posix(),
                                'markdownFiles': markdown, 'skippedFiles': skipped})
            if len(folders) >= 256:
                break
        return folders

    def compile(self, source: str):
        workflow = parse_workflow(source)
        for relative in workflow.knowledge.values():
            if self.mode == 'hosted-demo' and relative not in self.bundled_paths:
                raise ValueError('Knowledge must use a bundled document directory')
            directory = self.resolve_collection(relative)
            for document in directory.glob('*.md'):
                if not document.resolve().is_relative_to(self.project_root):
                    raise ValueError('Source files must remain inside the configured project root')
        return workflow, build_index(workflow, self.project_root)
