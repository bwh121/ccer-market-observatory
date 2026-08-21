#!/usr/bin/env python3
"""Fail closed unless the CEA snapshot is complete enough to publish."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


DEFAULT_REPORT = Path("outputs") / "cea-market" / "data" / "quality_report.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    return parser.parse_args()


def validate(report: dict[str, object]) -> list[str]:
    failures: list[str] = []
    summary = report.get("summary")
    summary = summary if isinstance(summary, dict) else {}
    request_failures = report.get("request_failures")
    request_failures = request_failures if isinstance(request_failures, list) else []
    missing_dates = report.get("missing_expected_dates")
    missing_dates = missing_dates if isinstance(missing_dates, list) else []

    if report.get("status") not in {"PASS", "WARN"}:
        failures.append(f"quality status is {report.get('status')!r}")
    if int(summary.get("error_issues") or 0) != 0:
        failures.append(f"quality report contains {summary.get('error_issues')} error issues")
    if request_failures:
        failures.append(f"official source requests failed: {request_failures[:3]}")
    if missing_dates:
        failures.append(f"expected CEA trading dates are missing: {missing_dates[:10]}")
    if int(summary.get("dates_with_data") or 0) < 1:
        failures.append("CEA dataset contains no trading dates")
    if not summary.get("last_data_date"):
        failures.append("CEA dataset has no latest trading date")
    return failures


def main() -> int:
    args = parse_args()
    try:
        report = json.loads(args.report.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"CEA quality gate: cannot read {args.report}: {exc}", file=sys.stderr)
        return 2

    failures = validate(report)
    if failures:
        for failure in failures:
            print(f"CEA quality gate: {failure}", file=sys.stderr)
        return 2

    summary = report["summary"]
    print(
        "CEA quality gate: publishable | "
        f"{summary['first_data_date']} to {summary['last_data_date']} | "
        f"{summary['dates_with_data']} trading dates"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
