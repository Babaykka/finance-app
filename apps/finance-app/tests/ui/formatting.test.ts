import { describe, expect, it } from "vitest";
import { formatStorageRate } from "@/app/storage/page";
import { formatMoney } from "@/domain/money";
import { sortStoragePlacesForView, type StoragePlaceView } from "@/server/ui/finance-view-data";

describe("UI formatting", () => {
  it("renders ruble and USDT balances compactly", () => {
    expect(formatMoney(1784000, "RUB")).toBe("1 784 000 RUB");
    expect(formatMoney(8431, "USDT")).toBe("8 431 USDT");
  });

  it("renders storage rates as stored percent values", () => {
    expect(formatStorageRate(6.5)).toBe("6,5%");
    expect(formatStorageRate(null)).toBeNull();
  });

  it("sorts storage places by attention priority rank", () => {
    const basePlace = {
      id: "place",
      type: "bank_account",
      subtype: "card_account",
      holderContext: "мой счет",
      asset: "RUB" as const,
      amount: 1,
      amountKind: "exact",
      availability: "immediate",
      rate: null,
      interestPaymentDay: null,
      status: "active",
      comment: null
    };
    const places: StoragePlaceView[] = [
      { ...basePlace, id: "low", name: "Low", attentionPriority: "low" },
      { ...basePlace, id: "medium", name: "Medium", attentionPriority: "medium" },
      { ...basePlace, id: "urgent", name: "Urgent", attentionPriority: "urgent" },
      { ...basePlace, id: "high", name: "High", attentionPriority: "high" }
    ];

    expect(sortStoragePlacesForView(places).map((place) => place.name)).toEqual([
      "Urgent",
      "High",
      "Medium",
      "Low"
    ]);
  });
});
