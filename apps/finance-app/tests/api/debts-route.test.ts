import { describe, expect, it } from "vitest";
import { CreateDebtApiSchema } from "@/app/api/debts/route";

describe("debts route schema", () => {
  it("accepts a Геворг personal debt payload", () => {
    const payload = {
      partyName: "Геворг",
      type: "personal_debt",
      basis: "личный долг",
      asset: "RUB",
      originalAmount: 50000,
      status: "scheduled",
      nextPaymentAmount: 10000,
      nextPaymentDate: "2026-06-10T00:00:00.000Z",
      attentionPriority: "high",
      comment: "Геворг вернет долг частями."
    };

    expect(CreateDebtApiSchema.parse(payload)).toEqual(payload);
  });
});
