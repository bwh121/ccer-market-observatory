import copy
import unittest

from scripts.validate_cea_dashboard import validate


def valid_dashboard() -> dict:
    return {
        "tradeDataThrough": "2026-08-20",
        "daily": [
            {
                "date": "2026-08-20",
                "subject": "COMCEA",
                "open": 97.4,
                "high": 98.0,
                "low": 97.4,
                "close": 97.81,
            }
        ],
        "participants": {"verificationTargets": [{}] * 14_122},
        "quality": {"verificationPdfCoverage": {"publishReady": True}},
    }


def valid_quality() -> dict:
    return {"summary": {"last_data_date": "2026-08-20", "price_rows": 1}}


class ValidateCeaDashboardTests(unittest.TestCase):
    def test_accepts_publishable_dashboard(self) -> None:
        self.assertEqual(validate(valid_dashboard(), valid_quality()), [])

    def test_rejects_mismatched_date_and_zero_price(self) -> None:
        dashboard = copy.deepcopy(valid_dashboard())
        dashboard["tradeDataThrough"] = "2026-08-19"
        dashboard["daily"][0]["close"] = 0
        failures = validate(dashboard, valid_quality())
        self.assertTrue(any("trade date" in failure for failure in failures))
        self.assertTrue(any("zero OHLC" in failure for failure in failures))

    def test_rejects_participant_regression(self) -> None:
        dashboard = copy.deepcopy(valid_dashboard())
        dashboard["participants"]["verificationTargets"] = []
        failures = validate(dashboard, valid_quality())
        self.assertTrue(any("relationships" in failure for failure in failures))


if __name__ == "__main__":
    unittest.main()
