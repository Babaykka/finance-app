import { describe, expect, it } from "vitest";
import { AiParseResultSchema } from "@/server/ai/schema";

describe("AiParseResultSchema", () => {
  it("accepts a create debt action", () => {
    const parsed = AiParseResultSchema.parse({
      confidence: 0.86,
      summary: "Создать долг Геворга на 50 000 RUB.",
      actions: [
        {
          type: "create_debt",
          partyName: "Геворг",
          debtType: "personal_debt",
          basis: "личный долг другу",
          asset: "RUB",
          amount: 50000,
          status: "no_agreement",
          attentionPriority: "medium"
        }
      ],
      needsClarification: []
    });

    expect(parsed.actions[0].type).toBe("create_debt");
  });
});
