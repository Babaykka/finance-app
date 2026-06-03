import { describe, expect, it } from "vitest";
import { buildCurrentFinanceSeed } from "@/server/import/current-finance-seed";
import { CreateDebtSchema } from "@/server/services/debt-service";
import { CreateStoragePlaceSchema } from "@/server/services/storage-service";

describe("buildCurrentFinanceSeed", () => {
  it("contains current real storage and debt examples", () => {
    const seed = buildCurrentFinanceSeed("2026-06-03");

    expect(seed.importedAt).toBe("2026-06-03");
    expect(seed.storagePlaces).toHaveLength(8);
    expect(seed.debts).toHaveLength(4);
    expect(
      seed.storagePlaces.some(
        (place) => place.name === "Альфабанк Вероники" && place.amount === 804000
      )
    ).toBe(true);
    expect(
      seed.debts.some((debt) => debt.partyName === "Геворг" && debt.originalAmount === 50000)
    ).toBe(true);
    expect(
      seed.debts.some(
        (debt) => debt.partyName === "Степан Гаврилюк" && debt.nextPaymentDate === "2026-06-03"
      )
    ).toBe(true);
    expect(seed.storagePlaces.find((place) => place.name === "Тбанк накопительный счет")?.rate).toBe(
      7
    );
    expect(seed.storagePlaces.find((place) => place.name === "Сбер накопительный счет")?.rate).toBe(
      6.5
    );
  });

  it("matches audited service input schemas when owner metadata is added", () => {
    const seed = buildCurrentFinanceSeed("2026-06-03");
    const serviceMetadata = {
      ownerId: "owner-1",
      actor: "import:current-finance-seed",
      source: "import" as const
    };

    for (const place of seed.storagePlaces) {
      expect(CreateStoragePlaceSchema.parse({ ...place, ...serviceMetadata })).toEqual({
        ...place,
        ...serviceMetadata
      });
    }

    for (const debt of seed.debts) {
      const { nextPaymentDate, ...debtInput } = debt;
      const parsed = CreateDebtSchema.parse({
        ...debtInput,
        ...serviceMetadata,
        ...(nextPaymentDate ? { nextPaymentDate: new Date(`${nextPaymentDate}T00:00:00.000Z`) } : {})
      });

      expect(parsed.partyName).toBe(debt.partyName);
    }
  });
});
