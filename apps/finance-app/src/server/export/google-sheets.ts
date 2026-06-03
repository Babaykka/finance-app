export type GoogleSheetsCellValue = string | number | boolean | null;
export type GoogleSheetsExportTables = Record<string, GoogleSheetsCellValue[][]>;

type GoogleSheetsCreateResponse = {
  spreadsheetId: string;
  spreadsheetUrl: string;
};

type FetchResponse = Pick<Response, "ok" | "status" | "json">;
type Fetcher = (input: string, init: RequestInit) => Promise<FetchResponse>;

const GOOGLE_SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

const toSheetRange = (sheetName: string) => `'${sheetName.replace(/'/g, "''")}'!A1`;

export function createGoogleSheetsExportClient(input: {
  accessToken: string;
  fetcher: Fetcher;
}) {
  return {
    async exportTables(args: { title: string; tables: GoogleSheetsExportTables }) {
      const sheetTitles = Object.keys(args.tables);
      const createResponse = await input.fetcher(GOOGLE_SHEETS_API_BASE, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          properties: { title: args.title },
          sheets: sheetTitles.map((title) => ({ properties: { title } }))
        })
      });

      if (!createResponse.ok) {
        throw new Error(`Google Sheets create failed with HTTP ${createResponse.status}`);
      }

      const created = (await createResponse.json()) as GoogleSheetsCreateResponse;
      const valuesResponse = await input.fetcher(
        `${GOOGLE_SHEETS_API_BASE}/${created.spreadsheetId}/values:batchUpdate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            valueInputOption: "USER_ENTERED",
            data: Object.entries(args.tables).map(([sheetName, values]) => ({
              range: toSheetRange(sheetName),
              majorDimension: "ROWS",
              values
            }))
          })
        }
      );

      if (!valuesResponse.ok) {
        throw new Error(`Google Sheets values update failed with HTTP ${valuesResponse.status}`);
      }

      return {
        spreadsheetId: created.spreadsheetId,
        spreadsheetUrl: created.spreadsheetUrl
      };
    }
  };
}
