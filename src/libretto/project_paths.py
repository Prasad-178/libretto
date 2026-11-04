"""Containment rules shared by compilation and local source inspection."""

from pathlib import Path


def resolve_source_directory(project_root: Path, relative: str) -> Path:
    """Resolve a Markdown directory, rejecting traversal and escaping symlinks.

    Missing directories are allowed: they produce an empty retrieval index and
    Studio reports a missing-source warning. Existing Markdown symlinks must
    resolve within the same explicit project root.
    """
    root = project_root.resolve()
    path = Path(relative)
    directory = (root / path).resolve()
    if path.is_absolute() or ".." in path.parts or not directory.is_relative_to(root):
        raise ValueError("Knowledge must remain inside project_root")
    if any(not file.resolve().is_relative_to(root) for file in directory.glob("*.md")):
        raise ValueError("Knowledge files must remain inside project_root")
    return directory
