import tempfile
import unittest
from pathlib import Path

from openpyxl import load_workbook

from finance_system.schema import LISTS
from finance_system.workbook import build_workbook


class WorkbookTest(unittest.TestCase):
    def test_builds_expected_sheets_and_headers(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "finance-system-template.xlsx"
            build_workbook(output)
            workbook = load_workbook(output, data_only=False)

        self.assertEqual(
            workbook.sheetnames,
            [
                "01 Главная",
                "02 Места хранения",
                "03 Долги",
                "04 График и оплаты",
                "05 Крупные движения",
                "06 Справочники",
                "07 Расходы-план",
                "08 Решения",
            ],
        )
        storage = workbook["02 Места хранения"]
        self.assertEqual(storage["A1"].value, "ID места хранения")
        self.assertEqual(storage["C1"].value, "Тип места")
        self.assertEqual(storage["J1"].value, "Правило расчета процентов")
        self.assertEqual(storage["L1"].value, "День выплаты процентов")

    def test_reference_lists_are_written(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "finance-system-template.xlsx"
            build_workbook(output)
            workbook = load_workbook(output, data_only=False)

        refs = workbook["06 Справочники"]
        headers = [cell.value for cell in refs[1] if cell.value]
        self.assertIn("ТипыМест", headers)
        self.assertIn("ПодтипыМест", headers)
        self.assertIn("ПравилаПроцентов", headers)
        self.assertIn("ВлияниеСнятия", headers)
        self.assertIn("доходное банковское хранение", [refs.cell(row=i, column=2).value for i in range(2, 10)])
        self.assertEqual(len(headers), len(LISTS))

    def test_dashboard_contains_google_sheets_formulas(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "finance-system-template.xlsx"
            build_workbook(output)
            workbook = load_workbook(output, data_only=False)

        dashboard = workbook["01 Главная"]
        self.assertEqual(dashboard["A1"].value, "Финансовая система")
        self.assertEqual(dashboard["B5"].value, "=SUMIF('02 Места хранения'!$F:$F,A5,'02 Места хранения'!$G:$G)")
        self.assertEqual(dashboard["C5"].value, "=SUMIF('03 Долги'!$E:$E,A5,'03 Долги'!$G:$G)")
        self.assertIn("FILTER", dashboard["H5"].value)

    def test_data_validations_are_present(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "finance-system-template.xlsx"
            build_workbook(output)
            workbook = load_workbook(output, data_only=False)

        storage = workbook["02 Места хранения"]
        self.assertGreaterEqual(storage.data_validations.count, 8)


if __name__ == "__main__":
    unittest.main()
