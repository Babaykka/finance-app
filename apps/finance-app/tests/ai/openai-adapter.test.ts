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

  it("normalizes loose payment responses into the required draft schema", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        actions: [
          {
            type: "record_debt_payment",
            partyName: "Геворг",
            amount: 10000,
            asset: "RUB",
            paidAt: "2026-06-03",
            comment: "Частичный возврат."
          }
        ]
      })
    });
    const parser = createOpenAiParser({ responses: { create } }, "gpt-test");

    const result = await parser.parseMessage({
      text: "Геворг вернул 10000 рублей",
      context: {
        todayIso: "2026-06-03",
        timezone: "Europe/Moscow",
        knownDebts: [
          {
            id: "debt-1",
            partyName: "Геворг",
            remainingAmount: 50000,
            asset: "RUB"
          }
        ],
        knownStoragePlaces: []
      }
    });

    expect(result).toEqual({
      confidence: 0.7,
      summary: "AI создал черновик финансового действия.",
      actions: [
        {
          type: "record_debt_payment",
          partyName: "Геворг",
          amount: 10000,
          asset: "RUB",
          paymentDate: "2026-06-03",
          comment: "Частичный возврат."
        }
      ],
      needsClarification: []
    });
  });

  it("defaults loose payment dates to todayIso", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        confidence: 0.8,
        summary: "Зафиксировать возврат долга.",
        actions: [
          {
            type: "record_debt_payment",
            partyName: "Геворг",
            amount: 10000,
            asset: "RUB"
          }
        ],
        needsClarification: []
      })
    });
    const parser = createOpenAiParser({ responses: { create } }, "gpt-test");

    const result = await parser.parseMessage({
      text: "Геворг вернул 10000 рублей",
      context: {
        todayIso: "2026-06-03",
        timezone: "Europe/Moscow",
        knownDebts: [],
        knownStoragePlaces: []
      }
    });

    expect(result.actions[0]).toEqual({
      type: "record_debt_payment",
      partyName: "Геворг",
      amount: 10000,
      asset: "RUB",
      paymentDate: "2026-06-03"
    });
  });

  it("normalizes loose debt creation responses into the required draft schema", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        confidence: 0.74,
        summary: "Создать два долга.",
        actions: [
          {
            type: "create_debt",
            partyName: "Даниил Мятный",
            category: "заказ",
            amount: 9000,
            asset: "RUB",
            dueDate: "2026-06-30"
          },
          {
            type: "create_debt",
            partyName: "Грно",
            relationship: "друг",
            amount: 15000,
            asset: "RUB",
            dueDate: "2026-06-30"
          }
        ],
        needsClarification: []
      })
    });
    const parser = createOpenAiParser({ responses: { create } }, "gpt-test");

    const result = await parser.parseMessage({
      text: "долг даннил мятный 9000 руб до конца июня, заказ долг 15000 руб от Грно до конца июня, друг",
      context: {
        todayIso: "2026-06-04",
        timezone: "Europe/Moscow",
        knownDebts: [],
        knownStoragePlaces: []
      }
    });

    expect(result.actions).toEqual([
      {
        type: "create_debt",
        partyName: "Даниил Мятный",
        debtType: "work_receivable",
        basis: "заказ",
        amount: 9000,
        asset: "RUB",
        dueDate: "2026-06-30",
        status: "scheduled",
        attentionPriority: "medium"
      },
      {
        type: "create_debt",
        partyName: "Грно",
        debtType: "personal_debt",
        basis: "личный долг другу",
        amount: 15000,
        asset: "RUB",
        dueDate: "2026-06-30",
        status: "scheduled",
        attentionPriority: "medium"
      }
    ]);
  });

  it("treats money kept by another person as storage even if AI labels it as debt", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        confidence: 0.9,
        summary: "Добавление нового долга к Абелу на сумму 100000 рублей.",
        actions: [
          {
            type: "create_debt",
            partyName: "Абел",
            debtType: "personal_debt",
            basis: "личный долг",
            amount: 100000,
            asset: "RUB",
            status: "no_agreement",
            attentionPriority: "medium"
          }
        ],
        needsClarification: []
      })
    });
    const parser = createOpenAiParser({ responses: { create } }, "gpt-test");

    const result = await parser.parseMessage({
      text: "У Абела у меня есть 100к рублей",
      context: {
        todayIso: "2026-06-05",
        timezone: "Europe/Moscow",
        knownDebts: [],
        knownStoragePlaces: []
      }
    });

    expect(result.summary).toBe("Добавить место хранения: Абел, 100000 RUB.");
    expect(result.actions).toEqual([
      {
        type: "create_storage_place",
        name: "Абел",
        storageType: "trusted_person",
        subtype: "not_applicable",
        holderContext: "Абел",
        asset: "RUB",
        amount: 100000,
        amountKind: "exact",
        availability: "restricted",
        attentionPriority: "medium",
        comment: "Мои деньги находятся у этого человека; хранитель: Абел."
      }
    ]);
  });

  it("normalizes loose trusted-person storage responses into the required draft schema", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        confidence: 0.9,
        summary: "Создано место хранения денег у Абела.",
        actions: [
          {
            type: "create_storage_place",
            storageType: "trusted_person",
            partyName: "Абел",
            amount: 100000,
            asset: "RUB"
          }
        ],
        needsClarification: []
      })
    });
    const parser = createOpenAiParser({ responses: { create } }, "gpt-test");

    const result = await parser.parseMessage({
      text: "У Абела у меня есть 100к рублей",
      context: {
        todayIso: "2026-06-05",
        timezone: "Europe/Moscow",
        knownDebts: [],
        knownStoragePlaces: []
      }
    });

    expect(result.actions).toEqual([
      {
        type: "create_storage_place",
        name: "Абел",
        storageType: "trusted_person",
        subtype: "not_applicable",
        holderContext: "Абел",
        asset: "RUB",
        amount: 100000,
        amountKind: "exact",
        availability: "restricted",
        attentionPriority: "medium",
        comment: "Мои деньги находятся у этого человека; хранитель: Абел."
      }
    ]);
  });

  it("normalizes awkward cash storage names into a clean cash place name", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        confidence: 0.9,
        summary: "Пользователь сообщил о наличии наличных в размере 90 000 рублей.",
        actions: [
          {
            type: "create_storage_place",
            name: "Нал Cash",
            storageType: "cash",
            subtype: "not_applicable",
            holderContext: "Нал Cash",
            asset: "RUB",
            amount: 90000,
            amountKind: "exact",
            availability: "immediate",
            attentionPriority: "medium"
          }
        ],
        needsClarification: []
      })
    });
    const parser = createOpenAiParser({ responses: { create } }, "gpt-test");

    const result = await parser.parseMessage({
      text: "кошелек наличка у меня 90k рублей",
      context: {
        todayIso: "2026-06-05",
        timezone: "Europe/Moscow",
        knownDebts: [],
        knownStoragePlaces: []
      }
    });

    expect(result.actions[0]).toEqual({
      type: "create_storage_place",
      name: "Наличные",
      storageType: "cash",
      subtype: "not_applicable",
      holderContext: "Наличные",
      asset: "RUB",
      amount: 90000,
      amountKind: "exact",
      availability: "immediate",
      attentionPriority: "medium"
    });
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
