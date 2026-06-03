import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { buildDashboardSummary } from "@/server/services/dashboard-service";

describe("buildDashboardSummary", () => {
  it("summarizes assets, debts, urgent payments, and trusted-person storage", () => {
    const summary = buildDashboardSummary({
      storagePlaces: [
        {
          asset: "RUB",
          amount: 980000,
          type: "income_bank_product",
          status: "active",
          attentionPriority: "medium",
          name: "Тбанк"
        },
        {
          asset: "RUB",
          amount: 804000,
          type: "trusted_person",
          status: "check",
          attentionPriority: "high",
          name: "Альфабанк Вероники"
        },
        {
          asset: "USDT",
          amount: new Prisma.Decimal(7331),
          type: "crypto_exchange",
          status: "active",
          attentionPriority: "high",
          name: "Bybit"
        }
      ],
      debts: [
        {
          partyName: "Степан",
          remainingAmount: 25000,
          asset: "RUB",
          status: "scheduled",
          nextPaymentDate: new Date("2026-06-03T00:00:00.000Z")
        },
        {
          partyName: "Закрытый долг",
          remainingAmount: 0,
          asset: "RUB",
          status: "closed",
          nextPaymentDate: null
        }
      ],
      drafts: [
        { id: "draft-1", status: "pending" },
        { id: "draft-2", status: "confirmed" }
      ]
    });

    expect(summary.assets.RUB).toBe(1784000);
    expect(summary.assets.USDT).toBe(7331);
    expect(summary.attentionStorage[0].name).toBe("Альфабанк Вероники");
    expect(summary.upcomingDebts.map((debt) => debt.partyName)).toEqual(["Степан"]);
    expect(summary.pendingDraftCount).toBe(1);
  });

  it.each(["не число", "", null])("rejects invalid storage amounts: %s", (amount) => {
    expect(() =>
      buildDashboardSummary({
        storagePlaces: [
          {
            asset: "RUB",
            amount,
            type: "cash",
            status: "active",
            attentionPriority: "low",
            name: "Наличные"
          }
        ],
        debts: [],
        drafts: []
      })
    ).toThrow("Invalid numeric amount for Наличные");
  });
});
