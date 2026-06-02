import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "apps-script" / "FinanceSystem.gs"


class AppsScriptTest(unittest.TestCase):
    def test_script_exists_and_defines_required_functions(self):
        script = SCRIPT_PATH.read_text(encoding="utf-8")

        self.assertIn("function onOpen()", script)
        self.assertIn("function markSelectedStorageChecked()", script)
        self.assertIn("function refreshAttention()", script)

    def test_script_references_required_sheets(self):
        script = SCRIPT_PATH.read_text(encoding="utf-8")

        for sheet_name in [
            "01 Главная",
            "02 Места хранения",
            "03 Долги",
            "04 График и оплаты",
        ]:
            self.assertIn(sheet_name, script)

    def test_script_does_not_use_forbidden_external_services(self):
        script = SCRIPT_PATH.read_text(encoding="utf-8")

        for token in ["UrlFetchApp", "Jdbc", "DriveApp.getFiles", "GmailApp"]:
            self.assertNotIn(token, script)


if __name__ == "__main__":
    unittest.main()
