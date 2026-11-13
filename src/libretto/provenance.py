"""Non-secret execution identity shared by scripted and live test evidence."""

import subprocess
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any, Literal

from libretto.compiler import CompiledWorkflow


def library_identity() -> dict[str, Any]:
    """Identify a source checkout when available; installed wheels need no Git."""
    try:
        package_version = version("libretto-voice")
    except PackageNotFoundError:
        package_version = None
    commit = dirty = None
    root = Path(__file__).resolve().parents[2]
    if (root / ".git").exists():
        try:
            commit = subprocess.run(
                ["git", "-C", str(root), "rev-parse", "HEAD"],
                capture_output=True,
                text=True,
                timeout=2,
                check=True,
            ).stdout.strip()
            status = subprocess.run(
                ["git", "-C", str(root), "status", "--porcelain", "--untracked-files=no"],
                capture_output=True,
                text=True,
                timeout=2,
                check=True,
            ).stdout
            dirty = bool(status)
        except (OSError, subprocess.SubprocessError):
            commit = dirty = None
    return {"libretto_version": package_version, "libretto_commit": commit, "source_dirty": dirty}


def workflow_context(
    compiled: CompiledWorkflow,
    *,
    mode: Literal["scripted", "text", "voice"],
    models: dict[str, Any] | None = None,
    identity: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Record effective model choices separately from the hashed YAML definition."""
    workflow = compiled.workflow
    identity = library_identity() if identity is None else identity
    return {
        "workflow_sha256": compiled.source_hash,
        "workflow_id": workflow.id,
        "start_stage": workflow.start,
        "yaml_schema_version": workflow.version,
        **{key: identity.get(key) for key in ("libretto_version", "libretto_commit", "source_dirty")},
        "mode": mode,
        "models": workflow.models.model_dump() if models is None else dict(models),
        "speech": workflow.speech.model_dump(),
    }
