import { describe, expect, it } from "vitest";
import { applySimpleDraftCorrection } from "@/server/services/draft-correction-service";

describe("applySimpleDraftCorrection", () => {
  it("updates the amount of a single-action draft without calling AI", () => {
    const corrected = applySimpleDraftCorrection(
      {
        confidence: 0.91,
        summary: "Добавить ВТБ 280 000 RUB.",
        actions: [
          {
            type: "create_storage_place",
            name: "ВТБ счет",
            storageType: "bank_account",
            subtype: "card_account",
            holderContext: "ВТБ",
            asset: "RUB",
            amount: 280000,
            amountKind: "exact",
            availability: "immediate",
            attentionPriority: "medium"
          }
        ],
        needsClarification: []
      },
      "нет, сумма 100000"
    );

    expect(corrected?.actions[0]).toEqual({
      type: "create_storage_place",
      name: "ВТБ счет",
      storageType: "bank_account",
      subtype: "card_account",
      holderContext: "ВТБ",
      asset: "RUB",
      amount: 100000,
      amountKind: "exact",
      availability: "immediate",
      attentionPriority: "medium"
    });
    expect(corrected?.summary).toBe("Исправить сумму на 100000.");
    expect(corrected?.confidence).toBe(0.95);
  });

  it("updates the new name of a storage rename draft without calling AI", () => {
    const corrected = applySimpleDraftCorrection(
      {
        confidence: 0.98,
        summary: "Переименовать Нал cash в Наличные.",
        actions: [
          {
            type: "update_storage_place",
            currentName: "Нал cash",
            name: "Наличные"
          }
        ],
        needsClarification: []
      },
      "лучше Наличные в кошельке"
    );

    expect(corrected?.actions[0]).toEqual({
      type: "update_storage_place",
      currentName: "Нал cash",
      name: "Наличные в кошельке"
    });
    expect(corrected?.summary).toBe("Переименовать Нал cash в Наличные в кошельке.");
  });

  it("returns null for corrections that need AI context", () => {
    const corrected = applySimpleDraftCorrection(
      {
        confidence: 0.8,
        summary: "Создать долг.",
        actions: [
          {
            type: "create_debt",
            partyName: "Контрагент Дельта",
            debtType: "personal_debt",
            basis: "личный долг",
            asset: "RUB",
            amount: 100000,
            status: "no_agreement",
            attentionPriority: "medium"
          }
        ],
        needsClarification: []
      },
      "это не долг, это мои деньги у человека"
    );

    expect(corrected).toBeNull();
  });
});
