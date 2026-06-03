import { describe, expect, it } from "vitest";
import { CreateStoragePlaceApiSchema, POST } from "@/app/api/storage-places/route";

describe("CreateStoragePlaceApiSchema", () => {
  it("accepts ISO date strings for review and checked dates", () => {
    const payload = {
      name: "Сбер накопительный счет",
      type: "income_bank_product",
      subtype: "savings_account",
      holderContext: "мой Сбер",
      asset: "RUB",
      amount: 680000,
      amountKind: "exact",
      availability: "immediate",
      rate: 6.5,
      interestPaymentDay: 19,
      reviewOrEndDate: "2026-06-19T00:00:00.000Z",
      lastCheckedAt: "2026-06-03T00:00:00.000Z",
      status: "active",
      attentionPriority: "medium",
      comment: "Накопительный счет."
    };

    expect(CreateStoragePlaceApiSchema.parse(payload)).toEqual(payload);
  });

  it("rejects invalid POST bodies before resolving the local owner", async () => {
    const originalTelegramUserId = process.env.OWNER_TELEGRAM_USER_ID;
    delete process.env.OWNER_TELEGRAM_USER_ID;

    try {
      await expect(
        POST(
          new Request("http://localhost/api/storage-places", {
            method: "POST",
            body: JSON.stringify({})
          })
        )
      ).rejects.toThrow();
    } finally {
      if (originalTelegramUserId === undefined) {
        delete process.env.OWNER_TELEGRAM_USER_ID;
      } else {
        process.env.OWNER_TELEGRAM_USER_ID = originalTelegramUserId;
      }
    }
  });
});
