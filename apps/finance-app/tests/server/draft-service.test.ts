import { describe, expect, it, vi } from "vitest";
import { createAiDraft } from "@/server/services/draft-service";

describe("createAiDraft", () => {
  it("stores pending draft from parsed AI result", async () => {
    const db = {
      aiDraft: {
        create: vi.fn().mockResolvedValue({ id: "draft-1", status: "pending" })
      }
    };

    const draft = await createAiDraft(db as never, {
      ownerId: "owner-1",
      source: "telegram_text",
      rawText: "Геворг вернул 10000",
      parseResult: {
        confidence: 0.9,
        summary: "Записать оплату 10 000 RUB.",
        actions: [
          {
            type: "record_debt_payment",
            partyName: "Геворг",
            amount: 10000,
            asset: "RUB",
            paymentDate: "2026-06-03"
          }
        ],
        needsClarification: []
      }
    });

    expect(draft.status).toBe("pending");
    expect(db.aiDraft.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "pending",
        confidence: 0.9
      })
    });
  });
});
