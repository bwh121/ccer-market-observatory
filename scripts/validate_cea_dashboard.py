#!/usr/bin/env python3
"""Validate the generated public CEA dashboard before publication."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


PRICE_FIELDS = ("open", "high", "low", "close")


def validate(dashboard: dict[str, Any], quality: dict[str, Any]) -> list[str]:
    failures: list[str] = []
    daily = dashboard.get("daily")
    daily = daily if isinstance(daily, list) else []
    summary = quality.get("summary")
    summary = summary if isinstance(summary, dict) else {}

    expected_through = str(summary.get("last_data_date") or "")
    if dashboard.get("tradeDataThrough") != expected_through:
        failures.append("dashboard trade date does not match the validated collector report")

    price_rows = int(summary.get("price_rows") or 0)
    if len(daily) < price_rows:
        failures.append(f"dashboard has {len(daily)} daily rows but quality report has {price_rows} price rows")

    keys = [(str(row.get("date") or ""), str(row.get("subject") or "")) for row in daily]
    if len(keys) != len(set(keys)):
        failures.append("dashboard contains duplicate date-subject rows")

    zero_price_rows = [
        key
        for key, row in zip(keys, daily, strict=True)
        if any(row.get(field) == 0 for field in PRICE_FIELDS)
    ]
    if zero_price_rows:
        failures.append(f"dashboard contains zero OHLC values: {zero_price_rows[:3]}")

    composite_dates = [row.get("date") for row in daily if row.get("subject") == "COMCEA"]
    if not composite_dates or max(composite_dates) != expected_through:
        failures.append("composite series does not reach the validated trade date")

    participants = dashboard.get("participants")
    participants = participants if isinstance(participants, dict) else {}
    targets = participants.get("verificationTargets")
    targets = targets if isinstance(targets, list) else []
    if len(targets) < 14_000:
        failures.append(f"verification target relationships unexpectedly fell to {len(targets)}")

    dashboard_quality = dashboard.get("quality")
    dashboard_quality = dashboard_quality if isinstance(dashboard_quality, dict) else {}
    pdf_quality = dashboard_quality.get("verificationPdfCoverage")
    pdf_quality = pdf_quality if isinstance(pdf_quality, dict) else {}
    if pdf_quality.get("publishReady") is not True:
        failures.append("verification PDF coverage is not publication-ready")

    return failures


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dashboard", type=Path, required=True)
    parser.add_argument("--quality-report", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    dashboard = json.loads(args.dashboard.read_text(encoding="utf-8"))
    quality = json.loads(args.quality_report.read_text(encoding="utf-8"))
    failures = validate(dashboard, quality)
    print(json.dumps({"publishable": not failures, "failures": failures}, ensure_ascii=False))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
