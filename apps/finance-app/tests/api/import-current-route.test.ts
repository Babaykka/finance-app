import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCurrentFinanceSeed } from "@/server/import/current-finance-seed";
import { POST } from "@/app/api/import/current/route";

const mocks = vi.hoisted(() => {
  const storagePlaceFindMany = vi.fn();
  const debtFindMany = vi.fn();
  const getLocalOwner = vi.fn();
  const createStoragePlace = vi.fn();
  const createDebtWithOptionalPlan = vi.fn();

  return {
    prisma: {
      storagePlace: { findMany: storagePlaceFindMany },
      debt: { findMany: debtFindMany }
    },
    storagePlaceFindMany,
    debtFindMany,
    getLocalOwner,
    createStoragePlace,
    createDebtWithOptionalPlan
  };
});

vi.mock("@/server/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/server/auth/local-owner", () => ({
  getLocalOwner: mocks.getLocalOwner
}));

vi.mock("@/server/services/storage-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/storage-service")>()),
  createStoragePlace: mocks.createStoragePlace
}));

vi.mock("@/server/services/debt-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/debt-service")>()),
  createDebtWithOptionalPlan: mocks.createDebtWithOptionalPlan
}));

describe("import current route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T12:00:00.000Z"));
    mocks.getLocalOwner.mockResolvedValue({ id: "owner-1", telegramUserId: "123" });
    mocks.createStoragePlace.mockResolvedValue({ id: "storage-created" });
    mocks.createDebtWithOptionalPlan.mockResolvedValue({ id: "debt-created" });
  });

  it("creates missing seed rows through audited services and skips existing owner rows", async () => {
    mocks.storagePlaceFindMany.mockResolvedValue([{ name: "Bybit" }]);
    mocks.debtFindMany.mockResolvedValue([
      { partyName: "Геворг", basis: "личный долг другу" }
    ]);

    const response = await POST();

    expect(mocks.storagePlaceFindMany).toHaveBeenCalledWith({
      where: { ownerId: "owner-1" },
      select: { name: true }
    });
    expect(mocks.debtFindMany).toHaveBeenCalledWith({
      where: { ownerId: "owner-1" },
      select: { partyName: true, basis: true }
    });
    expect(mocks.createStoragePlace).toHaveBeenCalledTimes(7);
    expect(mocks.createStoragePlace).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: "Bybit" })
    );
    expect(mocks.createStoragePlace).toHaveBeenCalledWith(
      mocks.prisma,
      expect.objectContaining({
        ownerId: "owner-1",
        actor: "import:current-finance-seed",
        source: "import",
        name: "Тбанк накопительный счет"
      })
    );
    expect(mocks.createDebtWithOptionalPlan).toHaveBeenCalledTimes(3);
    expect(mocks.createDebtWithOptionalPlan).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ partyName: "Геворг" })
    );
    expect(mocks.createDebtWithOptionalPlan).toHaveBeenCalledWith(
      mocks.prisma,
      expect.objectContaining({
        ownerId: "owner-1",
        actor: "import:current-finance-seed",
        source: "import",
        partyName: "Степан Гаврилюк",
        nextPaymentDate: new Date("2026-06-03T00:00:00.000Z")
      })
    );
    await expect(response.json()).resolves.toEqual({
      importedAt: "2026-06-03",
      storagePlaces: { created: 7, skipped: 1 },
      debts: { created: 3, skipped: 1 }
    });
  });

  it("skips the full seed when it has already been imported", async () => {
    const seed = buildCurrentFinanceSeed("2026-06-03");
    mocks.storagePlaceFindMany.mockResolvedValue(
      seed.storagePlaces.map((place) => ({ name: place.name }))
    );
    mocks.debtFindMany.mockResolvedValue(
      seed.debts.map((debt) => ({ partyName: debt.partyName, basis: debt.basis }))
    );

    const response = await POST();

    expect(mocks.createStoragePlace).not.toHaveBeenCalled();
    expect(mocks.createDebtWithOptionalPlan).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      importedAt: "2026-06-03",
      storagePlaces: { created: 0, skipped: 8 },
      debts: { created: 0, skipped: 4 }
    });
  });
});
