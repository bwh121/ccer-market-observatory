import re
import unittest
from pathlib import Path
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "update-cea-market.yml"
BASELINE = ROOT / "data-pipeline" / "cea-full-cache-baseline-20260819.zip"


class CeaWorkflowTests(unittest.TestCase):
    def test_uses_dedicated_runner_and_fail_closed_gates(self) -> None:
        source = WORKFLOW.read_text(encoding="utf-8")

        self.assertIn("runs-on: [self-hosted, Windows, X64, cets-collector]", source)
        self.assertIn("python scripts/collect_cea_data.py", source)
        self.assertIn("python scripts/validate_cea_quality.py", source)
        self.assertIn("python scripts/validate_cea_dashboard.py", source)
        self.assertIn("git add -- public/data/cea-dashboard.json", source)
        self.assertIn("group: update-cea-market", source)
        self.assertNotIn("pnpm install", source)
        timeout = re.search(r"timeout-minutes:\s*(\d+)", source)
        self.assertIsNotNone(timeout)
        self.assertLessEqual(int(timeout.group(1)), 25)

    def test_cold_baseline_contains_complete_verified_history(self) -> None:
        with ZipFile(BASELINE) as archive:
            names = archive.namelist()

        self.assertGreaterEqual(len(names), 6061)
        self.assertEqual(sum("/substat/" in name for name in names), 1235)
        self.assertEqual(sum("/market/" in name for name in names), 4825)
        self.assertIn("raw/substat/20210716.json", names)
        self.assertIn("raw/substat/20260819.json", names)
        self.assertIn("raw/market/20260819_COMCEA.json", names)


if __name__ == "__main__":
    unittest.main()
