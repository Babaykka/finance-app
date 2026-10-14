import { describe, expect, it } from "vitest";
import { buildExportSnapshot, toFiniteSheetNumber } from "@/server/export/snapshot";

describe("buildExportSnapshot", () => {
  it("returns Google-Sheets-ready named tables", () => {
    const snapshot = buildExportSnapshot({
      storagePlaces: [{ name: "ВТБ счет", asset: "RUB", amount: 268187 }],
      debts: [{ partyName: "Контрагент Эпсилон", asset: "RUB", remainingAmount: "50000" }],
      payments: [
        {
          paymentDate: new Date("2026-06-03T00:00:00.000Z"),
          amount: { toString: () => "25000" },
          asset: "RUB",
          status: "expected"
        }
      ]
    });

    expect(snapshot["02 Места хранения"][0]).toEqual([
      "Название места",
      "Валюта/актив",
      "Текущая сумма"
    ]);
    expect(snapshot["02 Места хранения"][1]).toEqual(["ВТБ счет", "RUB", 268187]);
    expect(snapshot["03 Долги"][1]).toEqual(["Контрагент Эпсилон", "RUB", 50000]);
    expect(snapshot["04 График и оплаты"][1]).toEqual([
      "2026-06-03",
      25000,
      "RUB",
      "expected"
    ]);
  });

  it("normalizes date-only payment strings", () => {
    const snapshot = buildExportSnapshot({
      storagePlaces: [],
      debts: [],
      payments: [{ paymentDate: "2026-06-03", amount: 1500, asset: "RUB", status: "expected" }]
    });

    expect(snapshot["04 График и оплаты"][1]).toEqual([
      "2026-06-03",
      1500,
      "RUB",
      "expected"
    ]);
  });

  it("rejects timestamp strings in payment dates", () => {
    expect(() =>
      buildExportSnapshot({
        storagePlaces: [],
        debts: [],
        payments: [
          {
            paymentDate: "2026-06-03T00:00:00.000Z",
            amount: 1500,
            asset: "RUB",
            status: "expected"
          }
        ]
      })
    ).toThrow("Invalid date: 2026-06-03T00:00:00.000Z");
  });

  it("rejects unsafe numeric values instead of silently exporting them", () => {
    expect(() => toFiniteSheetNumber(null, "amount")).toThrow("amount must be numeric");
    expect(() => toFiniteSheetNumber("", "amount")).toThrow("amount must not be blank");
    expect(() => toFiniteSheetNumber(Number.NaN, "amount")).toThrow(
      "amount must be a finite number"
    );
  });
});
