import { describe, expect, it } from "vitest";
import { parseLocalFinanceMessage } from "@/server/ai/local-parser";
import type { AiParserContext } from "@/server/ai/parser";

const context: AiParserContext = {
  todayIso: "2026-06-07",
  timezone: "Europe/Moscow",
  knownDebts: [
    {
      id: "debt-stepan",
      partyName: "Степан Гаврилюк",
      remainingAmount: 25000,
      asset: "RUB"
    },
    {
      id: "debt-veronika-5000",
      partyName: "Вероника",
      remainingAmount: 5000,
      asset: "RUB"
    },
    {
      id: "debt-veronika-13000",
      partyName: "Вероника",
      remainingAmount: 13000,
      asset: "RUB"
    }
  ],
  knownStoragePlaces: [
    {
      id: "storage-vtb",
      name: "ВТБ счет",
      amount: 268187,
      asset: "RUB"
    },
    {
      id: "storage-cash",
      name: "Нал cash",
      amount: 90000,
      asset: "RUB"
    }
  ]
};

describe("local finance parser", () => {
  it("updates a known bank storage place without the AI parser", () => {
    const result = parseLocalFinanceMessage({
      text: "можешь добавить что у меня 280k руб в втб под 0%",
      context
    });

    expect(result).toEqual({
      confidence: 0.93,
      summary: "Обновить место хранения: ВТБ счет, 280000 RUB под 0%.",
      actions: [
        {
          type: "update_storage_place",
          storagePlaceId: "storage-vtb",
          currentName: "ВТБ счет",
          amount: 280000,
          asset: "RUB",
          amountKind: "exact",
          rate: 0
        }
      ],
      needsClarification: []
    });
  });

  it("normalizes cash storage aliases to a readable name", () => {
    const result = parseLocalFinanceMessage({
      text: "кошелек наличка у меня 90к рублей",
      context
    });

    expect(result?.actions[0]).toEqual({
      type: "update_storage_place",
      storagePlaceId: "storage-cash",
      currentName: "Нал cash",
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
    expect(result?.summary).toBe("Обновить место хранения: Наличные, 90000 RUB.");
  });

  it("records a payment against a single matching known debt", () => {
    const result = parseLocalFinanceMessage({
      text: "Степан Гаврилюк оплатил 25000 рублей",
      context
    });

    expect(result).toEqual({
      confidence: 0.95,
      summary: "Записать оплату долга: Степан Гаврилюк, 25000 RUB.",
      actions: [
        {
          type: "record_debt_payment",
          partyName: "Степан Гаврилюк",
          debtId: "debt-stepan",
          amount: 25000,
          asset: "RUB",
          paymentDate: "2026-06-07"
        }
      ],
      needsClarification: []
    });
  });

  it("splits several payments across exact matching debts", () => {
    const result = parseLocalFinanceMessage({
      text: "Вероника оплатила долг 5000 рублей и 13000 рублей",
      context
    });

    expect(result?.actions).toEqual([
      {
        type: "record_debt_payment",
        partyName: "Вероника",
        debtId: "debt-veronika-5000",
        amount: 5000,
        asset: "RUB",
        paymentDate: "2026-06-07"
      },
      {
        type: "record_debt_payment",
        partyName: "Вероника",
        debtId: "debt-veronika-13000",
        amount: 13000,
        asset: "RUB",
        paymentDate: "2026-06-07"
      }
    ]);
    expect(result?.needsClarification).toEqual([]);
  });

  it("treats money kept by a person as storage, not debt", () => {
    const result = parseLocalFinanceMessage({
      text: "у Абела у меня есть 100к рублей",
      context
    });

    expect(result?.actions[0]).toEqual({
      type: "create_storage_place",
      name: "Абела",
      storageType: "trusted_person",
      subtype: "not_applicable",
      holderContext: "Абела",
      asset: "RUB",
      amount: 100000,
      amountKind: "exact",
      availability: "restricted",
      attentionPriority: "medium",
      comment: "Мои деньги находятся у этого человека; хранитель: Абела."
    });
  });

  it("treats money on another person's bank account as trusted-person storage", () => {
    const result = parseLocalFinanceMessage({
      text: "на альфабанк вероники 804000 руб",
      context
    });

    expect(result?.actions[0]).toEqual({
      type: "create_storage_place",
      name: "Альфабанк Вероники",
      storageType: "trusted_person",
      subtype: "not_applicable",
      holderContext: "Вероники",
      asset: "RUB",
      amount: 804000,
      amountKind: "exact",
      availability: "restricted",
      attentionPriority: "medium",
      comment: "Мои деньги находятся у этого человека; хранитель: Вероники."
    });
  });

  it("creates a personal debt with a Russian due date", () => {
    const result = parseLocalFinanceMessage({
      text: "тарон друг должен оплатить 2000 руб до 12 июня",
      context
    });

    expect(result?.actions[0]).toEqual({
      type: "create_debt",
      partyName: "Тарон",
      debtType: "personal_debt",
      basis: "личный долг",
      asset: "RUB",
      amount: 2000,
      status: "scheduled",
      dueDate: "2026-06-12",
      attentionPriority: "medium",
      comment: "Друг."
    });
  });

  it("returns null for ambiguous finance-like text", () => {
    expect(
      parseLocalFinanceMessage({
        text: "Вероника что-то там по долгам, разберемся позже",
        context
      })
    ).toBeNull();
  });
});
