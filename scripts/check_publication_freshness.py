#!/usr/bin/env python3
"""Decide whether a daily run needs to rebuild the public market snapshots."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path


SHANGHAI = dt.timezone(dt.timedelta(hours=8))


def read_published_date(dashboard_path: Path) -> str | None:
    try:
        dashboard = json.loads(dashboard_path.read_text(encoding="utf-8"))
        published = str(dashboard.get("generatedAt") or "")[:10]
        dt.date.fromisoformat(published)
        return published
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return None


def should_update(
    event_name: str,
    published_dates: str | None | list[str | None] | tuple[str | None, ...],
    today: str,
) -> bool:
    if event_name != "schedule":
        return True
    if isinstance(published_dates, (str, type(None))):
        published_dates = [published_dates]
    return any(published_date != today for published_date in published_dates)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dashboard", type=Path, required=True)
    parser.add_argument("--cea-dashboard", type=Path)
    parser.add_argument("--event-name", required=True)
    parser.add_argument("--today", default=dt.datetime.now(SHANGHAI).date().isoformat())
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    dt.date.fromisoformat(args.today)
    published_dates = {
        "ccer": read_published_date(args.dashboard),
        "cea": read_published_date(args.cea_dashboard) if args.cea_dashboard else None,
    }
    dates_to_check = list(published_dates.values()) if args.cea_dashboard else published_dates["ccer"]
    needs_update = should_update(args.event_name, dates_to_check, args.today)

    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with Path(github_output).open("a", encoding="utf-8") as output:
            output.write(f"needs_update={'true' if needs_update else 'false'}\n")

    print(
        json.dumps(
            {
                "event": args.event_name,
                "publishedDates": published_dates,
                "today": args.today,
                "needsUpdate": needs_update,
            },
            ensure_ascii=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
