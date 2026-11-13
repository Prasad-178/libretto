"""Human and JSON reports for local scenario files and suites."""

import asyncio
import json
import tempfile
from pathlib import Path

from pydantic import ValidationError

from libretto.compiler import WorkflowCompileError

from .runner import run_scenario
from .schema import load_scenario


def _setup_message(error: Exception) -> str:
    if isinstance(error, ValidationError):
        return "; ".join(
            f"{'.'.join(map(str, item['loc']))}: {item['type']}" for item in error.errors(include_input=False)
        )
    if isinstance(error, WorkflowCompileError):
        return "; ".join(f"{'.'.join(map(str, issue.path))}: {issue.code}" for issue in error.issues)
    return str(error)


def _write_evidence(output: Path, reports: list) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=output.parent, prefix=".libretto-evidence-", delete=False
        ) as handle:
            temporary = Path(handle.name)
            json.dump(
                {
                    "format": "libretto.scenario-evidence",
                    "version": 1,
                    "runs": [report.model_dump() for report in reports],
                },
                handle,
                indent=2,
                ensure_ascii=False,
            )
            handle.write("\n")
        temporary.replace(output)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def test_command(path: Path, *, machine_json: bool = False, output: Path | None = None) -> int:
    """Return 0 success, 1 failed checks/execution, or 2 invalid input/setup."""
    reports, errors = [], []
    workflow_inputs: set[Path] = set()
    if path.is_dir():
        files = sorted(
            item
            for item in path.rglob("*")
            if item.is_file() and item.name.endswith((".scenario.yaml", ".scenario.yml", ".scenario.json"))
        )
    else:
        files = [path] if path.is_file() else []
    if not files:
        errors.append(f"{path}: no scenario files found")
    for file in files:
        try:
            scenario = load_scenario(file)
            workflow_inputs.add((file.parent / scenario.workflow).resolve())
            report = asyncio.run(run_scenario(scenario, base_dir=file.parent))
            reports.append(report)
        except (OSError, ValueError, TypeError) as error:
            errors.append(f"{file}: {_setup_message(error)}")
    if output is not None and not errors:
        try:
            if output.resolve() in workflow_inputs | {file.resolve() for file in files}:
                raise ValueError("Evidence output must not overwrite a scenario or workflow input")
            _write_evidence(output, reports)
        except (OSError, ValueError) as error:
            errors.append(f"Evidence was not saved: {_setup_message(error)}")
    passed = not errors and bool(reports) and all(report.passed for report in reports)
    if machine_json:
        print(
            json.dumps(
                {
                    "passed": passed,
                    "scenarios": [report.model_dump() for report in reports],
                    "errors": errors,
                },
                indent=2,
                ensure_ascii=False,
            )
        )
    else:
        for report in reports:
            print(f"{'PASS' if report.passed else 'FAIL'} {report.name}")
            for failure in report.failures:
                print(f"  {failure}")
        for error in errors:
            print(f"ERROR {error}")
        print(f"{sum(report.passed for report in reports)}/{len(reports)} scenarios passed")
    return 2 if errors else (0 if passed else 1)
