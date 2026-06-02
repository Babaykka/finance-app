import unittest

from finance_system.schema import LISTS, SHEETS, sheet_by_name


class SchemaTest(unittest.TestCase):
    def test_sheet_names_are_unique(self):
        names = [sheet.name for sheet in SHEETS]
        self.assertEqual(len(names), len(set(names)))

    def test_required_sheets_exist(self):
        expected = {
            "01 Главная",
            "02 Места хранения",
            "03 Долги",
            "04 График и оплаты",
            "05 Крупные движения",
            "06 Справочники",
            "07 Расходы-план",
            "08 Решения",
        }
        self.assertEqual({sheet.name for sheet in SHEETS}, expected)

    def test_linked_data_sheets_have_id_columns(self):
        for name in [
            "02 Места хранения",
            "03 Долги",
            "04 График и оплаты",
            "05 Крупные движения",
            "07 Расходы-план",
            "08 Решения",
        ]:
            first_column = sheet_by_name(name).columns[0]
            self.assertTrue(first_column.key.startswith("id_"), name)
            self.assertIn("ID", first_column.title)

    def test_dropdowns_reference_existing_lists(self):
        for sheet in SHEETS:
            for column in sheet.columns:
                if column.dropdown:
                    self.assertIn(column.dropdown, LISTS, f"{sheet.name}.{column.key}")

    def test_interest_bearing_storage_model_is_explicit(self):
        storage = sheet_by_name("02 Места хранения")
        keys = {column.key for column in storage.columns}
        self.assertIn("interest_rule", keys)
        self.assertIn("interest_period", keys)
        self.assertIn("interest_payment_day", keys)
        self.assertIn("withdrawal_interest_effect", keys)
        self.assertIn("early_withdrawal_terms", keys)
        self.assertIn("доходное банковское хранение", LISTS["ТипыМест"])
        self.assertIn("накопительный счет", LISTS["ПодтипыМест"])
        self.assertIn("вклад", LISTS["ПодтипыМест"])


if __name__ == "__main__":
    unittest.main()
