import json
import tempfile
import unittest
from pathlib import Path

from scripts.check_publication_freshness import read_published_date, should_update


class PublicationFreshnessTests(unittest.TestCase):
    def test_current_scheduled_snapshot_skips_rebuild(self) -> None:
        self.assertFalse(should_update("schedule", "2026-08-05", "2026-08-05"))
        self.assertFalse(
            should_update("schedule", ["2026-08-05", "2026-08-05"], "2026-08-05")
        )

    def test_stale_scheduled_snapshot_rebuilds(self) -> None:
        self.assertTrue(should_update("schedule", "2026-08-04", "2026-08-05"))
        self.assertTrue(
            should_update("schedule", ["2026-08-05", "2026-08-04"], "2026-08-05")
        )
        self.assertTrue(
            should_update("schedule", ["2026-08-04", "2026-08-05"], "2026-08-05")
        )

    def test_manual_and_push_events_always_rebuild(self) -> None:
        for event_name in ("workflow_dispatch", "push"):
            with self.subTest(event_name=event_name):
                self.assertTrue(should_update(event_name, "2026-08-05", "2026-08-05"))

    def test_missing_or_invalid_dashboard_rebuilds(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            dashboard = Path(directory) / "dashboard.json"
            self.assertIsNone(read_published_date(dashboard))

            dashboard.write_text("not json", encoding="utf-8")
            self.assertIsNone(read_published_date(dashboard))

            dashboard.write_text(json.dumps({"generatedAt": "invalid"}), encoding="utf-8")
            self.assertIsNone(read_published_date(dashboard))


if __name__ == "__main__":
    unittest.main()
