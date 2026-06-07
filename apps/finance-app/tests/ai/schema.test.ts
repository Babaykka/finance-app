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

  it("rejects empty required action fields", () => {
    expect(() =>
      AiParseResultSchema.parse({
        confidence: 0.86,
        summary: "Создать долг.",
        actions: [
          {
            type: "create_debt",
            partyName: "",
            debtType: "personal_debt",
            basis: "личный долг другу",
            asset: "RUB",
            amount: 50000,
            status: "no_agreement",
            attentionPriority: "medium"
          }
        ],
        needsClarification: []
      })
    ).toThrow();
  });

  it("rejects arbitrary action date strings", () => {
    expect(() =>
      AiParseResultSchema.parse({
        confidence: 0.86,
        summary: "Записать оплату.",
        actions: [
          {
            type: "record_debt_payment",
            partyName: "Геворг",
            amount: 10000,
            asset: "RUB",
            paymentDate: "сегодня"
          }
        ],
        needsClarification: []
      })
    ).toThrow();
  });

  it("rejects impossible calendar dates", () => {
    expect(() =>
      AiParseResultSchema.parse({
        confidence: 0.86,
        summary: "Создать долг.",
        actions: [
          {
            type: "create_debt",
            partyName: "Геворг",
            debtType: "personal_debt",
            basis: "личный долг другу",
            asset: "RUB",
            amount: 50000,
            status: "scheduled",
            dueDate: "2026-02-31",
            attentionPriority: "medium"
          }
        ],
        needsClarification: []
      })
    ).toThrow();
  });

  it("requires a target for record debt payment actions", () => {
    expect(() =>
      AiParseResultSchema.parse({
        confidence: 0.86,
        summary: "Записать оплату.",
        actions: [
          {
            type: "record_debt_payment",
            amount: 10000,
            asset: "RUB",
            paymentDate: "2026-06-03"
          }
        ],
        needsClarification: []
      })
    ).toThrow();
  });

  it("accepts a storage place rename action", () => {
    const parsed = AiParseResultSchema.parse({
      confidence: 0.9,
      summary: "Переименовать Нал cash в Наличные в кошельке.",
      actions: [
        {
          type: "update_storage_place",
          currentName: "Нал cash",
          name: "Наличные в кошельке"
        }
      ],
      needsClarification: []
    });

    expect(parsed.actions[0]).toEqual({
      type: "update_storage_place",
      currentName: "Нал cash",
      name: "Наличные в кошельке"
    });
  });

  it("requires a target and at least one changed field for storage updates", () => {
    expect(() =>
      AiParseResultSchema.parse({
        confidence: 0.9,
        summary: "Переименовать место хранения.",
        actions: [
          {
            type: "update_storage_place",
            name: "Наличные в кошельке"
          }
        ],
        needsClarification: []
      })
    ).toThrow();

    expect(() =>
      AiParseResultSchema.parse({
        confidence: 0.9,
        summary: "Переименовать место хранения.",
        actions: [
          {
            type: "update_storage_place",
            currentName: "Нал cash"
          }
        ],
        needsClarification: []
      })
    ).toThrow();
  });
});
