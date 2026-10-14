import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/export/google-sheets/route";

const mocks = vi.hoisted(() => {
  const storagePlaceFindMany = vi.fn();
  const debtFindMany = vi.fn();
  const debtPaymentFindMany = vi.fn();
  const exportJobCreate = vi.fn();
  const exportJobUpdate = vi.fn();
  const getLocalOwner = vi.fn();
  const buildExportSnapshot = vi.fn();
  const exportTables = vi.fn();
  const createGoogleSheetsExportClient = vi.fn();

  return {
    prisma: {
      storagePlace: { findMany: storagePlaceFindMany },
      debt: { findMany: debtFindMany },
      debtPayment: { findMany: debtPaymentFindMany },
      exportJob: { create: exportJobCreate, update: exportJobUpdate }
    },
    storagePlaceFindMany,
    debtFindMany,
    debtPaymentFindMany,
    exportJobCreate,
    exportJobUpdate,
    getLocalOwner,
    buildExportSnapshot,
    exportTables,
    createGoogleSheetsExportClient
  };
});

vi.mock("@/server/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/server/auth/local-owner", () => ({
  getLocalOwner: mocks.getLocalOwner
}));

vi.mock("@/server/export/snapshot", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/export/snapshot")>()),
  buildExportSnapshot: mocks.buildExportSnapshot
}));

vi.mock("@/server/export/google-sheets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/export/google-sheets")>()),
  createGoogleSheetsExportClient: mocks.createGoogleSheetsExportClient
}));

describe("Google Sheets export route", () => {
  const previousAccessToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T12:00:00.000Z"));
    process.env.GOOGLE_OAUTH_ACCESS_TOKEN = "google-token";
    mocks.getLocalOwner.mockResolvedValue({ id: "owner-1", telegramUserId: "123" });
    mocks.storagePlaceFindMany.mockResolvedValue([{ name: "ВТБ счет", asset: "RUB", amount: "1" }]);
    mocks.debtFindMany.mockResolvedValue([{ partyName: "Контрагент Эпсилон", asset: "RUB", remainingAmount: "2" }]);
    mocks.debtPaymentFindMany.mockResolvedValue([]);
    mocks.buildExportSnapshot.mockReturnValue({
      "02 Места хранения": [["Название места"], ["ВТБ счет"]]
    });
    mocks.exportTables.mockResolvedValue({
      spreadsheetId: "sheet-1",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-1/edit"
    });
    mocks.createGoogleSheetsExportClient.mockReturnValue({ exportTables: mocks.exportTables });
    mocks.exportJobCreate.mockResolvedValue({ id: "export-job-1" });
    mocks.exportJobUpdate.mockResolvedValue({ id: "export-job-1" });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (previousAccessToken === undefined) {
      delete process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
    } else {
      process.env.GOOGLE_OAUTH_ACCESS_TOKEN = previousAccessToken;
    }
  });

  it("returns 503 when Google OAuth token is missing", async () => {
    delete process.env.GOOGLE_OAUTH_ACCESS_TOKEN;

    const response = await POST();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "GOOGLE_OAUTH_ACCESS_TOKEN is required for Google Sheets export"
    });
    expect(mocks.getLocalOwner).not.toHaveBeenCalled();
    expect(mocks.createGoogleSheetsExportClient).not.toHaveBeenCalled();
  });

  it("exports owner-scoped snapshot tables and records the export job lifecycle", async () => {
    const response = await POST();

    expect(mocks.storagePlaceFindMany).toHaveBeenCalledWith({
      where: { ownerId: "owner-1" },
      select: {
        name: true,
        asset: true,
        amount: true
      },
      orderBy: { name: "asc" }
    });
    expect(mocks.debtFindMany).toHaveBeenCalledWith({
      where: { ownerId: "owner-1" },
      select: {
        partyName: true,
        asset: true,
        remainingAmount: true
      },
      orderBy: { partyName: "asc" }
    });
    expect(mocks.debtPaymentFindMany).toHaveBeenCalledWith({
      where: { ownerId: "owner-1" },
      select: {
        paymentDate: true,
        amount: true,
        asset: true,
        status: true
      },
      orderBy: { paymentDate: "asc" }
    });
    expect(mocks.buildExportSnapshot).toHaveBeenCalledWith({
      storagePlaces: [{ name: "ВТБ счет", asset: "RUB", amount: "1" }],
      debts: [{ partyName: "Контрагент Эпсилон", asset: "RUB", remainingAmount: "2" }],
      payments: []
    });
    expect(mocks.createGoogleSheetsExportClient).toHaveBeenCalledWith({
      accessToken: "google-token",
      fetcher: fetch
    });
    expect(mocks.exportTables).toHaveBeenCalledWith({
      title: "Финансы export 2026-06-03",
      tables: {
        "02 Места хранения": [["Название места"], ["ВТБ счет"]]
      }
    });
    expect(mocks.exportJobCreate).toHaveBeenCalledWith({
      data: {
        ownerId: "owner-1",
        target: "google_sheets",
        status: "running"
      }
    });
    expect(mocks.exportJobCreate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.exportTables.mock.invocationCallOrder[0]
    );
    expect(mocks.exportJobUpdate).toHaveBeenCalledWith({
      where: { id: "export-job-1" },
      data: {
        status: "finished",
        finishedAt: new Date("2026-06-03T12:00:00.000Z"),
        spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-1/edit"
      }
    });
    await expect(response.json()).resolves.toEqual({
      spreadsheetId: "sheet-1",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-1/edit"
    });
  });

  it("records a failed export job when the Google API call fails", async () => {
    mocks.exportTables.mockRejectedValue(
      new Error("Google Sheets values update failed with HTTP 429")
    );

    const response = await POST();

    expect(response.status).toBe(502);
    expect(mocks.exportJobCreate).toHaveBeenCalledWith({
      data: {
        ownerId: "owner-1",
        target: "google_sheets",
        status: "running"
      }
    });
    expect(mocks.exportJobUpdate).toHaveBeenCalledWith({
      where: { id: "export-job-1" },
      data: {
        status: "failed",
        finishedAt: new Date("2026-06-03T12:00:00.000Z"),
        error: "Google Sheets values update failed with HTTP 429"
      }
    });
    await expect(response.json()).resolves.toEqual({
      error: "Google Sheets export failed"
    });
  });
});
