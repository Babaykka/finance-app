const DASHBOARD_SHEET = '01 Главная';
const STORAGE_SHEET = '02 Места хранения';
const DEBTS_SHEET = '03 Долги';
const PAYMENTS_SHEET = '04 График и оплаты';

const STORAGE_TYPE_COLUMN = 3;
const STORAGE_ASSET_COLUMN = 6;
const STORAGE_AMOUNT_COLUMN = 7;
const STORAGE_CHECKED_AT_COLUMN = 16;
const STORAGE_STATUS_COLUMN = 17;
const STORAGE_PRIORITY_COLUMN = 18;

const ATTENTION_START_ROW = 4;
const ATTENTION_START_COLUMN = 8;
const ATTENTION_COLUMNS = 6;
const ATTENTION_RANGE = 'H4:M100';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Финансы')
    .addItem('Отметить выбранные места проверенными', 'markSelectedStorageChecked')
    .addItem('Собрать блок внимания', 'refreshAttention')
    .addToUi();
}

function markSelectedStorageChecked() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getActiveSheet();

  if (sheet.getName() !== STORAGE_SHEET) {
    spreadsheet.toast('Перейдите на лист мест хранения.', 'Финансы');
    return;
  }

  const range = sheet.getActiveRange();
  if (!range || range.getRow() <= 1) {
    spreadsheet.toast('Выберите строки ниже заголовка.', 'Финансы');
    return;
  }

  const startRow = range.getRow();
  const rowCount = range.getNumRows();
  const checkedValues = Array.from({ length: rowCount }, () => [new Date()]);
  sheet.getRange(startRow, STORAGE_CHECKED_AT_COLUMN, rowCount, 1).setValues(checkedValues);
  spreadsheet.toast(`Проверено строк: ${rowCount}`, 'Финансы');
}

function refreshAttention() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const dashboard = spreadsheet.getSheetByName(DASHBOARD_SHEET);
  const storage = spreadsheet.getSheetByName(STORAGE_SHEET);
  spreadsheet.getSheetByName(DEBTS_SHEET);
  spreadsheet.getSheetByName(PAYMENTS_SHEET);

  if (!dashboard || !storage) {
    spreadsheet.toast('Не найдены нужные листы.', 'Финансы');
    return;
  }

  const lastRow = storage.getLastRow();
  const rows = lastRow > 1
    ? storage.getRange(2, 1, lastRow - 1, STORAGE_PRIORITY_COLUMN).getValues()
    : [];
  const attentionRows = rows
    .filter((row) => (
      row[STORAGE_TYPE_COLUMN - 1] === 'у доверенного лица'
      || row[STORAGE_STATUS_COLUMN - 1] === 'проверить'
      || row[STORAGE_PRIORITY_COLUMN - 1] === 'срочно'
    ))
    .map((row) => [
      row[1],
      row[STORAGE_TYPE_COLUMN - 1],
      row[STORAGE_ASSET_COLUMN - 1],
      row[STORAGE_AMOUNT_COLUMN - 1],
      row[STORAGE_STATUS_COLUMN - 1],
      row[STORAGE_PRIORITY_COLUMN - 1],
    ]);

  dashboard.getRange(ATTENTION_RANGE).clearContent();
  dashboard
    .getRange(ATTENTION_START_ROW, ATTENTION_START_COLUMN, 1, ATTENTION_COLUMNS)
    .setValues([['Место', 'Тип', 'Актив', 'Сумма', 'Статус', 'Приоритет']]);

  if (attentionRows.length > 0) {
    dashboard
      .getRange(ATTENTION_START_ROW + 1, ATTENTION_START_COLUMN, attentionRows.length, ATTENTION_COLUMNS)
      .setValues(attentionRows);
  }

  spreadsheet.toast(`В блоке внимания строк: ${attentionRows.length}`, 'Финансы');
}
