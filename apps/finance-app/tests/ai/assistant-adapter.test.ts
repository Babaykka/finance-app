import { describe, expect, it, vi } from "vitest";
import { createOpenAiAssistantResponder } from "@/server/ai/assistant-adapter";

describe("OpenAI assistant adapter", () => {
  it("returns a concise Telegram-safe finance assistant reply", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: "  У тебя 1 928 187 RUB в местах хранения.  "
    });
    const responder = createOpenAiAssistantResponder({ responses: { create } }, "gpt-assistant-test");
    const context = {
      todayIso: "2026-06-05",
      timezone: "Europe/Moscow",
      assetTotals: [{ asset: "RUB", amount: 1928187 }],
      storagePlaces: [
        {
          name: "ВТБ",
          type: "bank_account",
          subtype: "card_account",
          holderContext: "личный счет",
          asset: "RUB",
          amount: 268187,
          rate: null,
          availability: "immediate",
          interestPaymentDay: null,
          comment: null
        }
      ],
      debts: [],
      pendingDraftCount: 0
    };

    const result = await responder.answerMessage({
      text: "Сколько у меня денег?",
      context
    });

    expect(create).toHaveBeenCalledWith({
      model: "gpt-assistant-test",
      input: [
        expect.objectContaining({
          role: "system",
          content: expect.stringContaining("личный финансовый помощник")
        }),
        {
          role: "user",
          content: JSON.stringify({
            text: "Сколько у меня денег?",
            context
          })
        }
      ]
    });
    expect(result).toEqual({ text: "У тебя 1 928 187 RUB в местах хранения." });
  });

  it("rejects empty assistant responses", async () => {
    const create = vi.fn().mockResolvedValue({ output_text: " " });
    const responder = createOpenAiAssistantResponder({ responses: { create } }, "gpt-test");

    await expect(
      responder.answerMessage({
        text: "привет",
        context: {
          todayIso: "2026-06-05",
          timezone: "Europe/Moscow",
          assetTotals: [],
          storagePlaces: [],
          debts: [],
          pendingDraftCount: 0
        }
      })
    ).rejects.toThrow("OpenAI assistant response output_text is required");
  });
});
