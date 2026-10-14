import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/export/snapshot/route";

const mocks = vi.hoisted(() => {
  const storagePlaceFindMany = vi.fn();
  const debtFindMany = vi.fn();
  const debtPaymentFindMany = vi.fn();
  const getLocalOwner = vi.fn();
  const buildExportSnapshot = vi.fn();

  return {
    prisma: {
      storagePlace: { findMany: storagePlaceFindMany },
      debt: { findMany: debtFindMany },
      debtPayment: { findMany: debtPaymentFindMany }
    },
    storagePlaceFindMany,
    debtFindMany,
    debtPaymentFindMany,
    getLocalOwner,
    buildExportSnapshot
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

describe("export snapshot route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLocalOwner.mockResolvedValue({ id: "owner-1", telegramUserId: "123" });
    mocks.buildExportSnapshot.mockReturnValue({
      "02 Места хранения": [["Название места", "Валюта/актив", "Текущая сумма"]]
    });
  });

  it("reads owner-scoped finance rows and returns a built snapshot", async () => {
    const storagePlaces = [{ name: "ВТБ счет", asset: "RUB", amount: "268187" }];
    const debts = [{ partyName: "Контрагент Эпсилон", asset: "RUB", remainingAmount: "50000" }];
    const payments = [
      {
        paymentDate: new Date("2026-06-03T00:00:00.000Z"),
        amount: "25000",
        asset: "RUB",
        status: "expected"
      }
    ];
    mocks.storagePlaceFindMany.mockResolvedValue(storagePlaces);
    mocks.debtFindMany.mockResolvedValue(debts);
    mocks.debtPaymentFindMany.mockResolvedValue(payments);

    const response = await GET();

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
      storagePlaces,
      debts,
      payments
    });
    await expect(response.json()).resolves.toEqual({
      "02 Места хранения": [["Название места", "Валюта/актив", "Текущая сумма"]]
    });
  });
});
