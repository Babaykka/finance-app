import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "apps-script" / "FinanceSystem.gs"


class AppsScriptTest(unittest.TestCase):
    def read_script(self):
        return SCRIPT_PATH.read_text(encoding="utf-8")

    def test_script_exists_and_defines_required_functions(self):
        script = self.read_script()

        self.assertIn("function onOpen()", script)
        self.assertIn("function markSelectedStorageChecked()", script)
        self.assertIn("function refreshAttention()", script)

    def test_script_references_required_sheets(self):
        script = self.read_script()

        for sheet_name in [
            "01 Главная",
            "02 Места хранения",
            "03 Долги",
            "04 График и оплаты",
        ]:
            self.assertIn(sheet_name, script)

    def test_script_does_not_use_forbidden_external_services(self):
        script = self.read_script()

        for token in ["UrlFetchApp", "Jdbc", "DriveApp.getFiles", "GmailApp"]:
            self.assertNotIn(token, script)

    def test_sheet_constants_are_defined(self):
        script = self.read_script()

        expected_constants = {
            "DASHBOARD_SHEET": "01 Главная",
            "STORAGE_SHEET": "02 Места хранения",
            "DEBTS_SHEET": "03 Долги",
            "PAYMENTS_SHEET": "04 График и оплаты",
        }
        for constant_name, sheet_name in expected_constants.items():
            self.assertIn(f"const {constant_name} = '{sheet_name}';", script)

    def test_storage_column_constants_are_defined(self):
        script = self.read_script()

        expected_constants = {
            "STORAGE_TYPE_COLUMN": 3,
            "STORAGE_ASSET_COLUMN": 6,
            "STORAGE_AMOUNT_COLUMN": 7,
            "STORAGE_CHECKED_AT_COLUMN": 16,
            "STORAGE_STATUS_COLUMN": 17,
            "STORAGE_PRIORITY_COLUMN": 18,
        }
        for constant_name, column_number in expected_constants.items():
            self.assertIn(f"const {constant_name} = {column_number};", script)

    def test_menu_contains_expected_labels_and_handlers(self):
        script = self.read_script()

        self.assertIn(".createMenu('Финансы')", script)
        self.assertIn(".addItem('Отметить выбранные места проверенными', 'markSelectedStorageChecked')", script)
        self.assertIn(".addItem('Собрать блок внимания', 'refreshAttention')", script)

    def test_attention_ranges_headers_and_predicates_are_present(self):
        script = self.read_script()

        self.assertIn("const ATTENTION_RANGE = 'H4:M100';", script)
        self.assertIn(".getRange('H4:M4')", script)
        self.assertIn("'Валюта/актив'", script)
        for predicate_value in ["у доверенного лица", "проверить", "срочно"]:
            self.assertIn(predicate_value, script)

    def test_checked_date_update_uses_selected_row_and_checked_column(self):
        script = self.read_script()

        self.assertIn("getRange(range.getRow(), STORAGE_CHECKED_AT_COLUMN, rowCount, 1)", script)


if __name__ == "__main__":
    unittest.main()
