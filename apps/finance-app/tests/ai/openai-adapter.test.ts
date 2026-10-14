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
        summary: "Создать место хранения Альфабанк резервный.",
        actions: [
          {
            type: "create_storage_place",
            name: "Альфабанк резервный",
            storageType: "trusted_person",
            subtype: "not_applicable",
            holderContext: "Другой владелец",
            asset: "RUB",
            amount: 804000,
            amountKind: "exact",
            availability: "restricted",
            attentionPriority: "high",
            comment: "Мои деньги на Альфабанк резервный."
          }
        ],
        needsClarification: []
      })
    });
    const parser = createOpenAiParser({ responses: { create } }, "gpt-test");
    const input = {
      text: "804000 рублей лежат в Альфабанке у другого владельца",
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
            partyName: "Контрагент Эпсилон",
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
      text: "Контрагент Эпсилон вернул 10000 рублей",
      context: {
        todayIso: "2026-06-03",
        timezone: "Europe/Moscow",
        knownDebts: [
          {
            id: "debt-1",
            partyName: "Контрагент Эпсилон",
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
          partyName: "Контрагент Эпсилон",
          debtId: "debt-1",
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
            partyName: "Контрагент Эпсилон",
            amount: 10000,
            asset: "RUB"
          }
        ],
        needsClarification: []
      })
    });
    const parser = createOpenAiParser({ responses: { create } }, "gpt-test");

    const result = await parser.parseMessage({
      text: "Контрагент Эпсилон вернул 10000 рублей",
      context: {
        todayIso: "2026-06-03",
        timezone: "Europe/Moscow",
        knownDebts: [
          {
            id: "debt-1",
            partyName: "Контрагент Эпсилон",
            remainingAmount: 50000,
            asset: "RUB"
          }
        ],
        knownStoragePlaces: []
      }
    });

    expect(result.actions[0]).toEqual({
      type: "record_debt_payment",
      partyName: "Контрагент Эпсилон",
      debtId: "debt-1",
      amount: 10000,
      asset: "RUB",
      paymentDate: "2026-06-03"
    });
  });

  it("attaches debtId to a payment when exactly one known debt matches the party", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        confidence: 0.86,
        summary: "Записать оплату долга Контрагента Альфа.",
        actions: [
          {
            type: "record_debt_payment",
            partyName: "Контрагент Альфа",
            amount: 25000,
            asset: "RUB",
            paymentDate: "2026-06-07"
          }
        ],
        needsClarification: []
      })
    });
    const parser = createOpenAiParser({ responses: { create } }, "gpt-test");

    const result = await parser.parseMessage({
      text: "Контрагент Альфа оплатил 25000 рублей",
      context: {
        todayIso: "2026-06-07",
        timezone: "Europe/Moscow",
        knownDebts: [
          {
            id: "debt-counterparty-alpha",
            partyName: "Контрагент Альфа",
            remainingAmount: 25000,
            asset: "RUB"
          }
        ],
        knownStoragePlaces: []
      }
    });

    expect(result.actions[0]).toEqual({
      type: "record_debt_payment",
      partyName: "Контрагент Альфа",
      debtId: "debt-counterparty-alpha",
      amount: 25000,
      asset: "RUB",
      paymentDate: "2026-06-07"
    });
    expect(result.needsClarification).toEqual([]);
  });

  it("requires clarification for a payment when several known debts match the party", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        confidence: 0.82,
        summary: "Записать оплату другого владельца.",
        actions: [
          {
            type: "record_debt_payment",
            partyName: "Другой владелец",
            amount: 18000,
            asset: "RUB",
            paymentDate: "2026-06-07"
          }
        ],
        needsClarification: []
      })
    });
    const parser = createOpenAiParser({ responses: { create } }, "gpt-test");

    const result = await parser.parseMessage({
      text: "Другой владелец оплатила 5000 рублей и 13000 рублей",
      context: {
        todayIso: "2026-06-07",
        timezone: "Europe/Moscow",
        knownDebts: [
          {
            id: "debt-holder-other-1",
            partyName: "Другой владелец",
            remainingAmount: 5000,
            asset: "RUB"
          },
          {
            id: "debt-holder-other-2",
            partyName: "Другой владелец",
            remainingAmount: 13000,
            asset: "RUB"
          }
        ],
        knownStoragePlaces: []
      }
    });

    expect(result.actions).toEqual([]);
    expect(result.needsClarification).toEqual([
      "По имени «Другой владелец» найдено несколько долгов в RUB. Укажи, к какому долгу относится оплата 18000 RUB."
    ]);
  });

  it("splits several payments by exact remaining debt amounts for the same party", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        confidence: 0.88,
        summary: "Записать две оплаты другого владельца.",
        actions: [
          {
            type: "record_debt_payment",
            partyName: "Другой владелец",
            amount: 5000,
            asset: "RUB",
            paymentDate: "2026-06-07"
          },
          {
            type: "record_debt_payment",
            partyName: "Другой владелец",
            amount: 13000,
            asset: "RUB",
            paymentDate: "2026-06-07"
          }
        ],
        needsClarification: []
      })
    });
    const parser = createOpenAiParser({ responses: { create } }, "gpt-test");

    const result = await parser.parseMessage({
      text: "Другой владелец оплатила долг 5000 рублей и 13000 рублей",
      context: {
        todayIso: "2026-06-07",
        timezone: "Europe/Moscow",
        knownDebts: [
          {
            id: "debt-holder-other-1",
            partyName: "Другой владелец",
            remainingAmount: 5000,
            asset: "RUB"
          },
          {
            id: "debt-holder-other-2",
            partyName: "Другой владелец",
            remainingAmount: 13000,
            asset: "RUB"
          }
        ],
        knownStoragePlaces: []
      }
    });

    expect(result.actions).toEqual([
      {
        type: "record_debt_payment",
        partyName: "Другой владелец",
        debtId: "debt-holder-other-1",
        amount: 5000,
        asset: "RUB",
        paymentDate: "2026-06-07"
      },
      {
        type: "record_debt_payment",
        partyName: "Другой владелец",
        debtId: "debt-holder-other-2",
        amount: 13000,
        asset: "RUB",
        paymentDate: "2026-06-07"
      }
    ]);
    expect(result.needsClarification).toEqual([]);
  });

  it("allows several partial payments to the same single matching debt", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        confidence: 0.88,
        summary: "Записать две оплаты другого владельца по одному долгу.",
        actions: [
          {
            type: "record_debt_payment",
            partyName: "Другой владелец",
            amount: 5000,
            asset: "RUB",
            paymentDate: "2026-06-07"
          },
          {
            type: "record_debt_payment",
            partyName: "Другой владелец",
            amount: 13000,
            asset: "RUB",
            paymentDate: "2026-06-07"
          }
        ],
        needsClarification: []
      })
    });
    const parser = createOpenAiParser({ responses: { create } }, "gpt-test");

    const result = await parser.parseMessage({
      text: "Другой владелец оплатила долг 5000 рублей и 13000 рублей, суммарно 18000 из 18000",
      context: {
        todayIso: "2026-06-07",
        timezone: "Europe/Moscow",
        knownDebts: [
          {
            id: "debt-holder-other",
            partyName: "Другой владелец",
            remainingAmount: 18000,
            asset: "RUB"
          }
        ],
        knownStoragePlaces: []
      }
    });

    expect(result.actions).toEqual([
      {
        type: "record_debt_payment",
        partyName: "Другой владелец",
        debtId: "debt-holder-other",
        amount: 5000,
        asset: "RUB",
        paymentDate: "2026-06-07"
      },
      {
        type: "record_debt_payment",
        partyName: "Другой владелец",
        debtId: "debt-holder-other",
        amount: 13000,
        asset: "RUB",
        paymentDate: "2026-06-07"
      }
    ]);
    expect(result.needsClarification).toEqual([]);
  });

  it("normalizes string amounts in payment drafts before schema validation", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        confidence: 0.88,
        summary: "Записать оплату Контрагента Альфа.",
        actions: [
          {
            type: "record_debt_payment",
            partyName: "Контрагент Альфа",
            amount: "25 000",
            paidAt: "2026-06-07",
            comment: "Оплата дипломной работы."
          }
        ],
        needsClarification: []
      })
    });
    const parser = createOpenAiParser({ responses: { create } }, "gpt-test");

    const result = await parser.parseMessage({
      text: "Контрагент Альфа оплатил 25 000 рублей",
      context: {
        todayIso: "2026-06-07",
        timezone: "Europe/Moscow",
        knownDebts: [
          {
            id: "debt-counterparty-alpha",
            partyName: "Контрагент Альфа",
            remainingAmount: 25000,
            asset: "RUB"
          }
        ],
        knownStoragePlaces: []
      }
    });

    expect(result.actions[0]).toEqual({
      type: "record_debt_payment",
      partyName: "Контрагент Альфа",
      debtId: "debt-counterparty-alpha",
      amount: 25000,
      asset: "RUB",
      paymentDate: "2026-06-07",
      comment: "Оплата дипломной работы."
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
            partyName: "Контрагент Гамма",
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
        partyName: "Контрагент Гамма",
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

  it("normalizes string debt amounts and next payment amounts", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        confidence: 0.84,
        summary: "Создать долг Контрагента Бета.",
        actions: [
          {
            type: "create_debt",
            partyName: "Контрагент Бета",
            debtType: "work_receivable",
            basis: "помощь по электричеству",
            amount: "1 500",
            asset: "RUB",
            dueDate: "2026-06-12",
            nextPaymentAmount: "1 500",
            status: "scheduled",
            attentionPriority: "medium"
          }
        ],
        needsClarification: []
      })
    });
    const parser = createOpenAiParser({ responses: { create } }, "gpt-test");

    const result = await parser.parseMessage({
      text: "Контрагенту Бета помощь по электричеству, она должна оплатить 1500 рублей до 12 июня",
      context: {
        todayIso: "2026-06-07",
        timezone: "Europe/Moscow",
        knownDebts: [],
        knownStoragePlaces: []
      }
    });

    expect(result.actions[0]).toEqual({
      type: "create_debt",
      partyName: "Контрагент Бета",
      debtType: "work_receivable",
      basis: "помощь по электричеству",
      amount: 1500,
      asset: "RUB",
      dueDate: "2026-06-12",
      nextPaymentAmount: 1500,
      status: "scheduled",
      attentionPriority: "medium"
    });
  });

  it("treats money kept by another person as storage even if AI labels it as debt", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        confidence: 0.9,
        summary: "Добавление нового долга к Контрагенту Дельта на сумму 100000 рублей.",
        actions: [
          {
            type: "create_debt",
            partyName: "Контрагент Дельта",
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
      text: "У Контрагента Дельта у меня есть 100к рублей",
      context: {
        todayIso: "2026-06-05",
        timezone: "Europe/Moscow",
        knownDebts: [],
        knownStoragePlaces: []
      }
    });

    expect(result.summary).toBe("Добавить место хранения: Контрагент Дельта, 100000 RUB.");
    expect(result.actions).toEqual([
      {
        type: "create_storage_place",
        name: "Контрагент Дельта",
        storageType: "trusted_person",
        subtype: "not_applicable",
        holderContext: "Контрагент Дельта",
        asset: "RUB",
        amount: 100000,
        amountKind: "exact",
        availability: "restricted",
        attentionPriority: "medium",
        comment: "Мои деньги находятся у этого человека; хранитель: Контрагент Дельта."
      }
    ]);
  });

  it("treats short 'person has my money' wording as trusted-person storage", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        confidence: 0.8,
        summary: "Добавление нового долга к Контрагенту Дельта на сумму 100000 рублей.",
        actions: [
          {
            type: "create_debt",
            partyName: "Контрагент Дельта",
            amount: "100к",
            asset: "RUB"
          }
        ],
        needsClarification: []
      })
    });
    const parser = createOpenAiParser({ responses: { create } }, "gpt-test");

    const result = await parser.parseMessage({
      text: "У Контрагента Дельта 100к рублей",
      context: {
        todayIso: "2026-06-07",
        timezone: "Europe/Moscow",
        knownDebts: [],
        knownStoragePlaces: []
      }
    });

    expect(result.actions[0]).toEqual({
      type: "create_storage_place",
      name: "Контрагент Дельта",
      storageType: "trusted_person",
      subtype: "not_applicable",
      holderContext: "Контрагент Дельта",
      asset: "RUB",
      amount: 100000,
      amountKind: "exact",
      availability: "restricted",
      attentionPriority: "medium",
      comment: "Мои деньги находятся у этого человека; хранитель: Контрагент Дельта."
    });
  });

  it("treats money on another person's bank account as trusted-person storage", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        confidence: 0.82,
        summary: "Добавление долга другого владельца.",
        actions: [
          {
            type: "create_debt",
            partyName: "Другой владелец",
            amount: 804000,
            asset: "RUB"
          }
        ],
        needsClarification: []
      })
    });
    const parser = createOpenAiParser({ responses: { create } }, "gpt-test");

    const result = await parser.parseMessage({
      text: "у другого владельца на Альфе 804000 рублей",
      context: {
        todayIso: "2026-06-07",
        timezone: "Europe/Moscow",
        knownDebts: [],
        knownStoragePlaces: []
      }
    });

    expect(result.actions[0]).toEqual({
      type: "create_storage_place",
      name: "Другой владелец",
      storageType: "trusted_person",
      subtype: "not_applicable",
      holderContext: "Другой владелец",
      asset: "RUB",
      amount: 804000,
      amountKind: "exact",
      availability: "restricted",
      attentionPriority: "medium",
      comment: "Мои деньги находятся у этого человека; хранитель: Другой владелец."
    });
  });

  it("normalizes loose trusted-person storage responses into the required draft schema", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        confidence: 0.9,
        summary: "Создано место хранения денег у Контрагента Дельта.",
        actions: [
          {
            type: "create_storage_place",
            storageType: "trusted_person",
            partyName: "Контрагент Дельта",
            amount: 100000,
            asset: "RUB"
          }
        ],
        needsClarification: []
      })
    });
    const parser = createOpenAiParser({ responses: { create } }, "gpt-test");

    const result = await parser.parseMessage({
      text: "У Контрагента Дельта у меня есть 100к рублей",
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
        name: "Контрагент Дельта",
        storageType: "trusted_person",
        subtype: "not_applicable",
        holderContext: "Контрагент Дельта",
        asset: "RUB",
        amount: 100000,
        amountKind: "exact",
        availability: "restricted",
        attentionPriority: "medium",
        comment: "Мои деньги находятся у этого человека; хранитель: Контрагент Дельта."
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

  it("corrects cash wallet wording even if AI labels it as a crypto wallet", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        confidence: 0.85,
        summary: "Добавить кошелек с наличными.",
        actions: [
          {
            type: "create_storage_place",
            name: "Кошелек наличка",
            storageType: "crypto_wallet",
            subtype: "wallet",
            holderContext: "Кошелек наличка",
            asset: "RUB",
            amount: "90к",
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
      text: "кошелек наличка у меня 90к рублей",
      context: {
        todayIso: "2026-06-07",
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

  it("normalizes string rates and interest days in storage drafts", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        confidence: 0.9,
        summary: "Добавить Сбер накопительный.",
        actions: [
          {
            type: "create_storage_place",
            name: "Сбер накопительный",
            storageType: "income_bank_product",
            subtype: "savings_account",
            holderContext: "Сбер",
            asset: "RUB",
            amount: "680 000",
            amountKind: "exact",
            availability: "restricted",
            rate: "6,5%",
            interestPaymentDay: "19",
            attentionPriority: "medium"
          }
        ],
        needsClarification: []
      })
    });
    const parser = createOpenAiParser({ responses: { create } }, "gpt-test");

    const result = await parser.parseMessage({
      text: "на моем Сбер накопительный счет лежит 680 000 руб под 6,5% каждое 19 число",
      context: {
        todayIso: "2026-06-07",
        timezone: "Europe/Moscow",
        knownDebts: [],
        knownStoragePlaces: []
      }
    });

    expect(result.actions[0]).toEqual({
      type: "create_storage_place",
      name: "Сбер накопительный",
      storageType: "income_bank_product",
      subtype: "savings_account",
      holderContext: "Сбер",
      asset: "RUB",
      amount: 680000,
      amountKind: "exact",
      availability: "restricted",
      rate: 6.5,
      interestPaymentDay: 19,
      attentionPriority: "medium"
    });
  });

  it("normalizes loose storage rename responses into a storage update action", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        confidence: 0.88,
        summary: "Переименовать Нал cash.",
        actions: [
          {
            type: "rename_storage_place",
            oldName: "Нал cash",
            newName: "Наличные в кошельке"
          }
        ],
        needsClarification: []
      })
    });
    const parser = createOpenAiParser({ responses: { create } }, "gpt-test");

    const result = await parser.parseMessage({
      text: "переименуй Нал cash в наличные в кошельке",
      context: {
        todayIso: "2026-06-05",
        timezone: "Europe/Moscow",
        knownDebts: [],
        knownStoragePlaces: [
          {
            id: "storage-cash",
            name: "Нал cash",
            asset: "RUB",
            amount: 90000
          }
        ]
      }
    });

    expect(result.actions[0]).toEqual({
      type: "update_storage_place",
      currentName: "Нал cash",
      name: "Наличные в кошельке"
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
