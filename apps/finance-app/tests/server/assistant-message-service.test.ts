import { describe, expect, it, vi } from "vitest";
import { buildFinanceAssistantContext } from "@/server/services/assistant-message-service";

describe("assistant-message-service", () => {
  it("builds a compact finance context for assistant replies", async () => {
    const decimalLike = (value: string) => ({ toString: () => value });
    const db = {
      storagePlace: {
        findMany: vi.fn().mockResolvedValue([
          {
            name: "ВТБ",
            type: "bank_account",
            subtype: "card_account",
            holderContext: "личный счет",
            asset: "RUB",
            amount: decimalLike("268187"),
            rate: null,
            availability: "immediate",
            interestPaymentDay: null,
            comment: null
          },
          {
            name: "Bybit",
            type: "crypto_exchange",
            subtype: "not_applicable",
            holderContext: "мой аккаунт",
            asset: "USDT",
            amount: decimalLike("7331"),
            rate: null,
            availability: "delayed",
            interestPaymentDay: null,
            comment: "эквивалент"
          }
        ])
      },
      debt: {
        findMany: vi.fn().mockResolvedValue([
          {
            partyName: "Геворг",
            type: "personal_debt",
            basis: "личный долг другу",
            asset: "RUB",
            remainingAmount: decimalLike("50000"),
            status: "no_agreement",
            nextPaymentAmount: null,
            nextPaymentDate: null,
            comment: null
          }
        ])
      },
      aiDraft: {
        count: vi.fn().mockResolvedValue(2)
      }
    };

    const context = await buildFinanceAssistantContext(db as never, {
      ownerId: "owner-1",
      todayIso: "2026-06-05",
      timezone: "Europe/Moscow"
    });

    expect(db.storagePlace.findMany).toHaveBeenCalledWith({
      where: { ownerId: "owner-1", status: { not: "closed" } },
      select: {
        name: true,
        type: true,
        subtype: true,
        holderContext: true,
        asset: true,
        amount: true,
        rate: true,
        availability: true,
        interestPaymentDay: true,
        comment: true
      },
      orderBy: { name: "asc" }
    });
    expect(db.debt.findMany).toHaveBeenCalledWith({
      where: { ownerId: "owner-1", status: { not: "closed" } },
      select: {
        partyName: true,
        type: true,
        basis: true,
        asset: true,
        remainingAmount: true,
        status: true,
        nextPaymentAmount: true,
        nextPaymentDate: true,
        comment: true
      },
      orderBy: [{ nextPaymentDate: "asc" }, { partyName: "asc" }]
    });
    expect(context).toEqual({
      todayIso: "2026-06-05",
      timezone: "Europe/Moscow",
      assetTotals: [
        { asset: "RUB", amount: 268187 },
        { asset: "USDT", amount: 7331 }
      ],
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
        },
        {
          name: "Bybit",
          type: "crypto_exchange",
          subtype: "not_applicable",
          holderContext: "мой аккаунт",
          asset: "USDT",
          amount: 7331,
          rate: null,
          availability: "delayed",
          interestPaymentDay: null,
          comment: "эквивалент"
        }
      ],
      debts: [
        {
          partyName: "Геворг",
          type: "personal_debt",
          basis: "личный долг другу",
          asset: "RUB",
          remainingAmount: 50000,
          status: "no_agreement",
          nextPaymentAmount: null,
          nextPaymentDate: null,
          comment: null
        }
      ],
      pendingDraftCount: 2
    });
  });
});
