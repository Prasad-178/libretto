"""Human and JSON reports for local scenario files and suites."""

import asyncio
import json
from pathlib import Path

from .runner import run_scenario
from .schema import load_scenario


def test_command(path: Path, *, machine_json: bool = False) -> int:
    """Return 0 success, 1 failed checks/execution, or 2 invalid input/setup."""
    reports, errors = [], []
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
            report = asyncio.run(run_scenario(scenario, base_dir=file.parent))
            reports.append(report)
        except (OSError, ValueError, TypeError) as error:
            errors.append(f"{file}: {error}")
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
