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
      },
      assistantMemory: {
        findMany: vi.fn().mockResolvedValue([
          {
            kind: "preference",
            text: "Наличные всегда называй «Наличные», без смешанных названий."
          }
        ])
      },
      assistantMessage: {
        findMany: vi.fn().mockResolvedValue([
          {
            role: "assistant",
            source: "telegram_text",
            text: "Запомнил, наличные буду называть аккуратно.",
            createdAt: new Date("2026-06-05T10:02:00.000Z")
          },
          {
            role: "user",
            source: "telegram_text",
            text: "запомни: наличку называй Наличные",
            createdAt: new Date("2026-06-05T10:01:00.000Z")
          }
        ])
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
    expect(db.assistantMemory.findMany).toHaveBeenCalledWith({
      where: { ownerId: "owner-1", status: "active" },
      select: { kind: true, text: true },
      orderBy: { updatedAt: "desc" },
      take: 30
    });
    expect(db.assistantMessage.findMany).toHaveBeenCalledWith({
      where: { ownerId: "owner-1" },
      select: { role: true, source: true, text: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 12
    });
    expect(context).toEqual({
      todayIso: "2026-06-05",
      timezone: "Europe/Moscow",
      memories: [
        {
          kind: "preference",
          text: "Наличные всегда называй «Наличные», без смешанных названий."
        }
      ],
      recentMessages: [
        {
          role: "user",
          source: "telegram_text",
          text: "запомни: наличку называй Наличные",
          createdAt: "2026-06-05T10:01:00.000Z"
        },
        {
          role: "assistant",
          source: "telegram_text",
          text: "Запомнил, наличные буду называть аккуратно.",
          createdAt: "2026-06-05T10:02:00.000Z"
        }
      ],
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
