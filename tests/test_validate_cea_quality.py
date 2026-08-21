import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

from scripts.collect_cea_data import Settings, collect_substats
from scripts.validate_cea_quality import validate


class ValidateCeaQualityTests(unittest.TestCase):
    def report(self):
        return {
            "status": "WARN",
            "summary": {
                "error_issues": 0,
                "dates_with_data": 1227,
                "first_data_date": "2021-07-16",
                "last_data_date": "2026-08-10",
            },
            "request_failures": [],
            "missing_expected_dates": [],
        }

    def test_allows_non_blocking_warnings(self):
        self.assertEqual(validate(self.report()), [])

    def test_rejects_missing_expected_trading_date(self):
        report = self.report()
        report["missing_expected_dates"] = ["2026-08-10"]
        self.assertTrue(any("missing" in failure for failure in validate(report)))

    def test_rejects_official_source_failure(self):
        report = self.report()
        report["request_failures"] = [{"trade_date": "2026-08-10"}]
        self.assertTrue(any("requests failed" in failure for failure in validate(report)))

    def test_retries_cached_empty_trading_date(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            output_dir = Path(temporary_directory)
            raw_path = output_dir / "raw" / "substat" / "20260810.json"
            raw_path.parent.mkdir(parents=True)
            raw_path.write_text(json.dumps({"success": True, "data": []}), encoding="utf-8")
            settings = Settings(
                output_dir=output_dir,
                end_date=date(2026, 8, 10),
                workers=1,
                timeout=5,
                retries=1,
                refresh=False,
            )
            refreshed = {"success": True, "data": [{"tradeDate": "20260810"}]}
            with patch("scripts.collect_cea_data.request_json", return_value=refreshed) as request:
                results, failures = collect_substats(settings, [date(2026, 8, 10)])
            self.assertEqual(failures, [])
            self.assertEqual(results["20260810"], refreshed)
            request.assert_called_once()


if __name__ == "__main__":
    unittest.main()
