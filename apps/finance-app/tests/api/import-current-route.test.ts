import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    vi.setSystemTime(new Date("2026-06-02T21:30:00.000Z"));
    mocks.getLocalOwner.mockResolvedValue({ id: "owner-1", telegramUserId: "123" });
    mocks.createStoragePlace.mockResolvedValue({ id: "storage-created" });
    mocks.createDebtWithOptionalPlan.mockResolvedValue({ id: "debt-created" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates seed rows through audited services and skips unique conflicts", async () => {
    const seed = buildCurrentFinanceSeed("2026-06-03");
    mocks.createStoragePlace.mockImplementation(async (_prisma, input) => {
      if (input.name === "Bybit") {
        throw { code: "P2002" };
      }

      return { id: "storage-created" };
    });
    mocks.createDebtWithOptionalPlan.mockImplementation(async (_prisma, input) => {
      if (input.partyName === "Геворг") {
        throw { code: "P2002" };
      }

      return { id: "debt-created" };
    });

    const response = await POST();

    expect(mocks.storagePlaceFindMany).not.toHaveBeenCalled();
    expect(mocks.debtFindMany).not.toHaveBeenCalled();
    expect(mocks.createStoragePlace).toHaveBeenCalledTimes(seed.storagePlaces.length);
    expect(mocks.createStoragePlace).toHaveBeenCalledWith(
      mocks.prisma,
      expect.objectContaining({
        ownerId: "owner-1",
        actor: "import:current-finance-seed",
        source: "import",
        name: "Тбанк накопительный счет",
        rate: 7
      })
    );
    expect(mocks.createDebtWithOptionalPlan).toHaveBeenCalledTimes(seed.debts.length);
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
    mocks.createStoragePlace.mockRejectedValue({ code: "P2002" });
    mocks.createDebtWithOptionalPlan.mockRejectedValue({ code: "P2002" });

    const response = await POST();

    expect(mocks.createStoragePlace).toHaveBeenCalledTimes(seed.storagePlaces.length);
    expect(mocks.createDebtWithOptionalPlan).toHaveBeenCalledTimes(seed.debts.length);
    await expect(response.json()).resolves.toEqual({
      importedAt: "2026-06-03",
      storagePlaces: { created: 0, skipped: 8 },
      debts: { created: 0, skipped: 4 }
    });
  });

  it("rethrows non-unique storage creation errors", async () => {
    mocks.createStoragePlace.mockRejectedValue(new Error("database unavailable"));

    await expect(POST()).rejects.toThrow("database unavailable");
  });
});
