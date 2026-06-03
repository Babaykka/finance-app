import { describe, expect, it, vi } from "vitest";
import { createGoogleSheetsExportClient } from "@/server/export/google-sheets";

describe("createGoogleSheetsExportClient", () => {
  it("creates a spreadsheet and writes named tables", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          spreadsheetId: "sheet-1",
          spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-1/edit"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ totalUpdatedCells: 6 })
      });

    const client = createGoogleSheetsExportClient({
      accessToken: "token",
      fetcher
    });

    const result = await client.exportTables({
      title: "Финансы export",
      tables: {
        "02 Места хранения": [["Название места"], ["ВТБ счет"]],
        "03 Долги": [["Должник"], ["Геворг"]]
      }
    });

    expect(result).toEqual({
      spreadsheetId: "sheet-1",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-1/edit"
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "https://sheets.googleapis.com/v4/spreadsheets",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json"
        }
      })
    );
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      properties: { title: "Финансы export" },
      sheets: [
        { properties: { title: "02 Места хранения" } },
        { properties: { title: "03 Долги" } }
      ]
    });
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "https://sheets.googleapis.com/v4/spreadsheets/sheet-1/values:batchUpdate",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json"
        }
      })
    );
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
      valueInputOption: "USER_ENTERED",
      data: [
        {
          range: "'02 Места хранения'!A1",
          majorDimension: "ROWS",
          values: [["Название места"], ["ВТБ счет"]]
        },
        {
          range: "'03 Долги'!A1",
          majorDimension: "ROWS",
          values: [["Должник"], ["Геворг"]]
        }
      ]
    });
  });

  it("escapes single quotes in sheet ranges", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          spreadsheetId: "sheet-1",
          spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-1/edit"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ totalUpdatedCells: 2 })
      });

    await createGoogleSheetsExportClient({ accessToken: "token", fetcher }).exportTables({
      title: "Export",
      tables: {
        "Лист с 'кавычкой'": [["A"], ["B"]]
      }
    });

    expect(JSON.parse(fetcher.mock.calls[1][1].body).data[0].range).toBe(
      "'Лист с ''кавычкой'''!A1"
    );
  });

  it("throws a clear error when spreadsheet creation fails", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn()
    });

    await expect(
      createGoogleSheetsExportClient({ accessToken: "token", fetcher }).exportTables({
        title: "Export",
        tables: {}
      })
    ).rejects.toThrow("Google Sheets create failed with HTTP 401");
  });

  it("throws a clear error when values update fails", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          spreadsheetId: "sheet-1",
          spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-1/edit"
        })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: vi.fn()
      });

    await expect(
      createGoogleSheetsExportClient({ accessToken: "token", fetcher }).exportTables({
        title: "Export",
        tables: {
          "02 Места хранения": [["Название места"]]
        }
      })
    ).rejects.toThrow("Google Sheets values update failed with HTTP 429");
  });
});
