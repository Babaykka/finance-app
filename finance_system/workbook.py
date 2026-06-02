from __future__ import annotations

import argparse
from pathlib import Path

from openpyxl import Workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter

from finance_system.schema import LISTS, SHEETS, SheetSpec, sheet_by_name


DEFAULT_OUTPUT = Path("dist/finance-system-template.xlsx")
DATA_ROW_LIMIT = 1000

HEADER_FILL = PatternFill("solid", fgColor="EAF2F8")
HEADER_FONT = Font(bold=True)
TRUSTED_PERSON_FILL = PatternFill("solid", fgColor="FFF2CC")
CHECK_FILL = PatternFill("solid", fgColor="FCE4D6")
OVERDUE_FILL = PatternFill("solid", fgColor="F4CCCC")


def column_letter_for(sheet_name: str, column_key: str) -> str:
    sheet_spec = sheet_by_name(sheet_name)
    for column_index, column in enumerate(sheet_spec.columns, start=1):
        if column.key == column_key:
            return get_column_letter(column_index)
    raise KeyError(f"Unknown column: {sheet_name}.{column_key}")


def build_workbook(output_path: Path = DEFAULT_OUTPUT) -> Path:
    output_path = Path(output_path)
    workbook = Workbook()

    first_sheet = workbook.active
    first_sheet.title = SHEETS[0].name
    for sheet_spec in SHEETS[1:]:
        workbook.create_sheet(sheet_spec.name)

    for sheet_spec in SHEETS:
        worksheet = workbook[sheet_spec.name]
        if sheet_spec.name == "01 Главная":
            _write_dashboard(worksheet)
        elif sheet_spec.name == "06 Справочники":
            _write_reference_lists(worksheet)
        else:
            _write_data_sheet(worksheet, sheet_spec)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    workbook.save(output_path)
    return output_path


def _write_dashboard(worksheet) -> None:
    storage_asset = column_letter_for("02 Места хранения", "asset")
    storage_amount = column_letter_for("02 Места хранения", "amount")
    storage_status = column_letter_for("02 Места хранения", "status")
    storage_last_column = get_column_letter(len(sheet_by_name("02 Места хранения").columns))
    debt_asset = column_letter_for("03 Долги", "asset")
    debt_remaining_amount = column_letter_for("03 Долги", "remaining_amount")

    worksheet["A1"] = "Финансовая система"
    worksheet["A1"].font = Font(bold=True, size=16)
    worksheet["A4"] = "Актив"
    worksheet["B4"] = "Места хранения"
    worksheet["C4"] = "Долги"
    worksheet["H4"] = "Требует внимания"
    worksheet["A5"] = "RUB"
    worksheet["B5"] = (
        f"=SUMIF('02 Места хранения'!${storage_asset}:${storage_asset},"
        f"A5,'02 Места хранения'!${storage_amount}:${storage_amount})"
    )
    worksheet["C5"] = (
        f"=SUMIF('03 Долги'!${debt_asset}:${debt_asset},"
        f"A5,'03 Долги'!${debt_remaining_amount}:${debt_remaining_amount})"
    )
    worksheet["H5"] = (
        f'=FILTER(\'02 Места хранения\'!A:{storage_last_column},'
        f'\'02 Места хранения\'!{storage_status}:{storage_status}="проверить")'
    )

    for row in worksheet.iter_rows(min_row=4, max_row=4, min_col=1, max_col=8):
        for cell in row:
            cell.fill = HEADER_FILL
            cell.font = HEADER_FONT

    worksheet.freeze_panes = "A4"
    for column_index, width in {1: 16, 2: 20, 3: 18, 8: 32}.items():
        worksheet.column_dimensions[get_column_letter(column_index)].width = width


def _write_reference_lists(worksheet) -> None:
    for column_index, (list_name, values) in enumerate(LISTS.items(), start=1):
        column_letter = get_column_letter(column_index)
        worksheet.cell(row=1, column=column_index, value=list_name)
        worksheet.cell(row=1, column=column_index).fill = HEADER_FILL
        worksheet.cell(row=1, column=column_index).font = HEADER_FONT
        worksheet.column_dimensions[column_letter].width = max(18, len(list_name) + 2)
        for row_index, value in enumerate(values, start=2):
            worksheet.cell(row=row_index, column=column_index, value=value)

    worksheet.freeze_panes = "A2"


def _write_data_sheet(worksheet, sheet_spec: SheetSpec) -> None:
    for column_index, column in enumerate(sheet_spec.columns, start=1):
        cell = worksheet.cell(row=1, column=column_index, value=column.title)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        worksheet.column_dimensions[get_column_letter(column_index)].width = column.width

        if column.kind == "number":
            for row_index in range(2, DATA_ROW_LIMIT + 1):
                worksheet.cell(row=row_index, column=column_index).number_format = "#,##0.00"
        elif column.kind == "date":
            for row_index in range(2, DATA_ROW_LIMIT + 1):
                worksheet.cell(row=row_index, column=column_index).number_format = "yyyy-mm-dd"

        if column.dropdown:
            _add_dropdown(worksheet, column_index, column.dropdown)

    worksheet.freeze_panes = f"A{sheet_spec.frozen_rows + 1}"
    worksheet.auto_filter.ref = worksheet.dimensions
    _add_conditional_formatting(worksheet, sheet_spec)


def _add_dropdown(worksheet, column_index: int, list_name: str) -> None:
    reference_column = list(LISTS).index(list_name) + 1
    reference_letter = get_column_letter(reference_column)
    last_row = len(LISTS[list_name]) + 1
    formula = f"'06 Справочники'!${reference_letter}$2:${reference_letter}${last_row}"
    validation = DataValidation(type="list", formula1=formula, allow_blank=True)
    validation.error = "Выберите значение из справочника."
    validation.errorTitle = "Недопустимое значение"
    worksheet.add_data_validation(validation)
    column_letter = get_column_letter(column_index)
    validation.add(f"{column_letter}2:{column_letter}{DATA_ROW_LIMIT}")


def _add_conditional_formatting(worksheet, sheet_spec: SheetSpec) -> None:
    last_column = get_column_letter(len(sheet_spec.columns))
    full_range = f"A2:{last_column}{DATA_ROW_LIMIT}"

    if sheet_spec.name == "02 Места хранения":
        storage_type = column_letter_for(sheet_spec.name, "storage_type")
        storage_status = column_letter_for(sheet_spec.name, "status")
        worksheet.conditional_formatting.add(
            full_range,
            FormulaRule(formula=[f'${storage_type}2="у доверенного лица"'], fill=TRUSTED_PERSON_FILL),
        )
        worksheet.conditional_formatting.add(
            full_range,
            FormulaRule(formula=[f'${storage_status}2="проверить"'], fill=CHECK_FILL),
        )
    elif sheet_spec.name == "03 Долги":
        debt_status = column_letter_for(sheet_spec.name, "status")
        worksheet.conditional_formatting.add(
            full_range,
            FormulaRule(formula=[f'${debt_status}2="просрочено"'], fill=OVERDUE_FILL),
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate the finance system workbook template.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    output_path = build_workbook(args.output)
    print(f"Workbook written to {output_path}")


if __name__ == "__main__":
    main()
