import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { createOpenAiParser, getOpenAiClient } from "@/server/ai/openai-adapter";

describe("OpenAI parser adapter", () => {
  it("requires OPENAI_API_KEY when constructing the default client", () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      expect(() => getOpenAiClient()).toThrow("OPENAI_API_KEY is required for AI parsing");
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("parses response output text into a create_storage_place action", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        confidence: 0.94,
        summary: "Создать место хранения Альфабанк Вероники.",
        actions: [
          {
            type: "create_storage_place",
            name: "Альфабанк Вероники",
            storageType: "trusted_person",
            subtype: "not_applicable",
            holderContext: "Вероника",
            asset: "RUB",
            amount: 804000,
            amountKind: "exact",
            availability: "restricted",
            attentionPriority: "high",
            comment: "Мои деньги на Альфабанк Вероники."
          }
        ],
        needsClarification: []
      })
    });
    const parser = createOpenAiParser({ responses: { create } }, "gpt-test");
    const input = {
      text: "804000 рублей лежат в Альфабанке у Вероники",
      context: {
        todayIso: "2026-06-03",
        timezone: "Europe/Moscow",
        knownDebts: [],
        knownStoragePlaces: []
      }
    };

    const result = await parser.parseMessage(input);

    expect(create).toHaveBeenCalledWith({
      model: "gpt-test",
      input: [
        expect.objectContaining({
          role: "system",
          content: expect.stringContaining("финансовый парсер")
        }),
        {
          role: "user",
          content: JSON.stringify(input)
        }
      ]
    });
    expect(result.actions[0]?.type).toBe("create_storage_place");
  });

  it("rejects missing response output text", async () => {
    const create = vi.fn().mockResolvedValue({ output_text: "" });
    const parser = createOpenAiParser({ responses: { create } }, "gpt-test");

    await expect(
      parser.parseMessage({
        text: "создай долг",
        context: {
          todayIso: "2026-06-03",
          timezone: "Europe/Moscow",
          knownDebts: [],
          knownStoragePlaces: []
        }
      })
    ).rejects.toThrow("OpenAI parser response output_text is required");
  });

  it("rejects non-json response output text with a stable error", async () => {
    const create = vi.fn().mockResolvedValue({ output_text: "не json" });
    const parser = createOpenAiParser({ responses: { create } }, "gpt-test");

    await expect(
      parser.parseMessage({
        text: "создай долг",
        context: {
          todayIso: "2026-06-03",
          timezone: "Europe/Moscow",
          knownDebts: [],
          knownStoragePlaces: []
        }
      })
    ).rejects.toThrow("OpenAI parser response must be valid JSON");
  });

  it("rejects schema-invalid json response output text", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        confidence: 0.8,
        summary: "",
        actions: [],
        needsClarification: []
      })
    });
    const parser = createOpenAiParser({ responses: { create } }, "gpt-test");

    await expect(
      parser.parseMessage({
        text: "создай долг",
        context: {
          todayIso: "2026-06-03",
          timezone: "Europe/Moscow",
          knownDebts: [],
          knownStoragePlaces: []
        }
      })
    ).rejects.toBeInstanceOf(ZodError);
  });
});
