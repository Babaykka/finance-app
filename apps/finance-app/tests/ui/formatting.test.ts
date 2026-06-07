import { describe, expect, it } from "vitest";
import {
  formatStorageInterestPaymentDay,
  formatStorageRate
} from "@/components/StoragePlaceCard";
import { formatMoney } from "@/domain/money";
import {
  sortDebtsForView,
  sortStoragePlacesForView,
  type DebtView,
  type StoragePlaceView
} from "@/server/ui/finance-view-data";

describe("UI formatting", () => {
  it("renders ruble and USDT balances compactly", () => {
    expect(formatMoney(1784000, "RUB")).toBe("1 784 000 RUB");
    expect(formatMoney(8431, "USDT")).toBe("8 431 USDT");
  });

  it("renders storage rates as stored percent values", () => {
    expect(formatStorageRate(6.5)).toBe("6,5%");
    expect(formatStorageRate(null)).toBe("0%");
  });

  it("renders storage interest payment day for every storage card", () => {
    expect(formatStorageInterestPaymentDay(7, 5)).toBe("5-е число");
    expect(formatStorageInterestPaymentDay(0, null)).toBe("нет");
    expect(formatStorageInterestPaymentDay(6.5, null)).toBe("дата не указана");
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

  it("sorts storage places by amount when requested", () => {
    const basePlace = {
      id: "place",
      type: "bank_account",
      subtype: "card_account",
      holderContext: "мой счет",
      asset: "RUB" as const,
      amountKind: "exact",
      availability: "immediate",
      rate: null,
      interestPaymentDay: null,
      status: "active",
      comment: null,
      attentionPriority: "low"
    };
    const places: StoragePlaceView[] = [
      { ...basePlace, id: "small", name: "Меньше", amount: 1000 },
      { ...basePlace, id: "large", name: "Больше", amount: 5000 }
    ];

    expect(sortStoragePlacesForView(places, "amount_desc").map((place) => place.name)).toEqual([
      "Больше",
      "Меньше"
    ]);
  });

  it("sorts debts by amount when requested", () => {
    const baseDebt = {
      id: "debt",
      type: "personal_debt",
      basis: "личный долг",
      asset: "RUB" as const,
      originalAmount: 1,
      status: "scheduled",
      nextPaymentAmount: null,
      nextPaymentDate: null,
      attentionPriority: "medium",
      comment: null
    };
    const debts: DebtView[] = [
      { ...baseDebt, id: "small", partyName: "Меньше", remainingAmount: 1000 },
      { ...baseDebt, id: "large", partyName: "Больше", remainingAmount: 5000 }
    ];

    expect(sortDebtsForView(debts, "amount_desc").map((debt) => debt.partyName)).toEqual([
      "Больше",
      "Меньше"
    ]);
  });
});
