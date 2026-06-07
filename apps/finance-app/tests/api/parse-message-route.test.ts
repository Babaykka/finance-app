import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { ParseMessageRequestSchema, POST } from "@/app/api/parse-message/route";

const mocks = vi.hoisted(() => {
  const debtFindMany = vi.fn();
  const storagePlaceFindMany = vi.fn();
  const getLocalOwner = vi.fn();
  const createAiDraft = vi.fn();
  const parseMessage = vi.fn();
  const createOpenAiParser = vi.fn();
  const getOpenAiClient = vi.fn();
  const openAiClient = { name: "openai-client" };

  return {
    prisma: {
      debt: { findMany: debtFindMany },
      storagePlace: { findMany: storagePlaceFindMany }
    },
    debtFindMany,
    storagePlaceFindMany,
    getLocalOwner,
    createAiDraft,
    parseMessage,
    createOpenAiParser,
    getOpenAiClient,
    openAiClient
  };
});

vi.mock("@/server/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/server/auth/local-owner", () => ({
  getLocalOwner: mocks.getLocalOwner
}));

vi.mock("@/server/services/draft-service", () => ({
  createAiDraft: mocks.createAiDraft
}));

vi.mock("@/server/ai/openai-adapter", () => ({
  createOpenAiParser: mocks.createOpenAiParser,
  getOpenAiClient: mocks.getOpenAiClient
}));

describe("parse-message route request schema", () => {
  const originalParseModel = process.env.OPENAI_PARSE_MODEL;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    mocks.getOpenAiClient.mockReturnValue(mocks.openAiClient);
    mocks.createOpenAiParser.mockReturnValue({ parseMessage: mocks.parseMessage });
  });

  afterEach(() => {
    vi.useRealTimers();

    if (originalParseModel === undefined) {
      delete process.env.OPENAI_PARSE_MODEL;
    } else {
      process.env.OPENAI_PARSE_MODEL = originalParseModel;
    }
  });

  it("defaults source to web_text", () => {
    expect(ParseMessageRequestSchema.parse({ text: "создай долг" })).toEqual({
      text: "создай долг",
      source: "web_text"
    });
  });

  it("accepts telegram_text requests", () => {
    expect(
      ParseMessageRequestSchema.parse({
        text: "Геворг вернул 10000",
        source: "telegram_text"
      }).source
    ).toBe("telegram_text");
  });

  it("accepts telegram_voice requests with a transcript", () => {
    expect(
      ParseMessageRequestSchema.parse({
        text: "Геворг вернул 10000",
        source: "telegram_voice",
        transcript: "Геворг вернул 10000"
      })
    ).toEqual({
      text: "Геворг вернул 10000",
      source: "telegram_voice",
      transcript: "Геворг вернул 10000"
    });
  });

  it("rejects invalid POST bodies before resolving the local owner", async () => {
    await expect(
      POST(
        new Request("http://localhost/api/parse-message", {
          method: "POST",
          body: JSON.stringify({})
        })
      )
    ).rejects.toBeInstanceOf(ZodError);

    expect(mocks.getLocalOwner).not.toHaveBeenCalled();
    expect(mocks.debtFindMany).not.toHaveBeenCalled();
    expect(mocks.storagePlaceFindMany).not.toHaveBeenCalled();
    expect(mocks.getOpenAiClient).not.toHaveBeenCalled();
    expect(mocks.createAiDraft).not.toHaveBeenCalled();
  });

  it("builds parser context and stores a web draft for valid requests", async () => {
    const decimalLike = (value: string) => ({ toString: () => value });
    const parseResult = {
      confidence: 0.91,
      summary: "Зафиксировать оплату по долгу.",
      actions: [
        {
          type: "record_debt_payment",
          partyName: "Геворг",
          amount: 10000,
          asset: "RUB",
          paidAt: "2026-06-04",
          comment: "Частичный возврат."
        }
      ],
      needsClarification: []
    };
    const draft = { id: "draft-1", status: "pending", parsedActions: parseResult };
    process.env.OPENAI_PARSE_MODEL = "gpt-route-test";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T21:30:00.000Z"));
    mocks.getLocalOwner.mockResolvedValue({ id: "owner-1", telegramUserId: "123" });
    mocks.debtFindMany.mockResolvedValue([
      {
        id: "debt-1",
        partyName: "Геворг",
        remainingAmount: decimalLike("50000"),
        asset: "RUB"
      }
    ]);
    mocks.storagePlaceFindMany.mockResolvedValue([
      {
        id: "storage-1",
        name: "Альфабанк Вероники",
        asset: "RUB",
        amount: decimalLike("804000.75")
      }
    ]);
    mocks.parseMessage.mockResolvedValue(parseResult);
    mocks.createAiDraft.mockResolvedValue(draft);

    const response = await POST(
      new Request("http://localhost/api/parse-message", {
        method: "POST",
        body: JSON.stringify({
          text: "Геворг вернул часть долга, сумму не написал",
          source: "web_form"
        })
      })
    );

    expect(mocks.debtFindMany).toHaveBeenCalledWith({
      where: { ownerId: "owner-1" },
      select: {
        id: true,
        partyName: true,
        remainingAmount: true,
        asset: true
      },
      orderBy: { partyName: "asc" }
    });
    expect(mocks.storagePlaceFindMany).toHaveBeenCalledWith({
      where: { ownerId: "owner-1" },
      select: {
        id: true,
        name: true,
        asset: true,
        amount: true
      },
      orderBy: { name: "asc" }
    });
    expect(mocks.getOpenAiClient).toHaveBeenCalledOnce();
    expect(mocks.createOpenAiParser).toHaveBeenCalledWith(mocks.openAiClient, "gpt-route-test");
    expect(mocks.parseMessage).toHaveBeenCalledWith({
      text: "Геворг вернул часть долга, сумму не написал",
      context: {
        todayIso: "2026-06-04",
        timezone: "Europe/Moscow",
        knownDebts: [
          {
            id: "debt-1",
            partyName: "Геворг",
            remainingAmount: 50000,
            asset: "RUB"
          }
        ],
        knownStoragePlaces: [
          {
            id: "storage-1",
            name: "Альфабанк Вероники",
            asset: "RUB",
            amount: 804000.75
          }
        ]
      }
    });
    expect(mocks.createAiDraft).toHaveBeenCalledWith(mocks.prisma, {
      ownerId: "owner-1",
      source: "web",
      rawText: "Геворг вернул часть долга, сумму не написал",
      transcript: undefined,
      parseResult
    });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(draft);
  });

  it("uses the production-safe default parser model when env is not set", async () => {
    const parseResult = {
      confidence: 0.8,
      summary: "Создать черновик долга.",
      actions: [],
      needsClarification: ["Уточнить имя должника."]
    };
    const draft = { id: "draft-default-model", status: "pending", parsedActions: parseResult };
    delete process.env.OPENAI_PARSE_MODEL;
    mocks.getLocalOwner.mockResolvedValue({ id: "owner-1", telegramUserId: "123" });
    mocks.debtFindMany.mockResolvedValue([]);
    mocks.storagePlaceFindMany.mockResolvedValue([]);
    mocks.parseMessage.mockResolvedValue(parseResult);
    mocks.createAiDraft.mockResolvedValue(draft);

    const response = await POST(
      new Request("http://localhost/api/parse-message", {
        method: "POST",
        body: JSON.stringify({
          text: "Геворг должен вернуть деньги, но сумму я уточню позже",
          source: "telegram_text"
        })
      })
    );

    expect(mocks.createOpenAiParser).toHaveBeenCalledWith(mocks.openAiClient, "gpt-5.2");
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(draft);
  });

  it("uses the local parser for clear storage updates without calling OpenAI", async () => {
    const draft = {
      id: "draft-local-storage",
      status: "pending",
      parsedActions: {
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
      }
    };
    mocks.getLocalOwner.mockResolvedValue({ id: "owner-1", telegramUserId: "123" });
    mocks.debtFindMany.mockResolvedValue([]);
    mocks.storagePlaceFindMany.mockResolvedValue([
      {
        id: "storage-vtb",
        name: "ВТБ счет",
        asset: "RUB",
        amount: { toString: () => "268187" }
      }
    ]);
    mocks.createAiDraft.mockResolvedValue(draft);

    const response = await POST(
      new Request("http://localhost/api/parse-message", {
        method: "POST",
        body: JSON.stringify({
          text: "можешь добавить что у меня 280k руб в втб под 0%",
          source: "telegram_text"
        })
      })
    );

    expect(mocks.getOpenAiClient).not.toHaveBeenCalled();
    expect(mocks.createOpenAiParser).not.toHaveBeenCalled();
    expect(mocks.parseMessage).not.toHaveBeenCalled();
    expect(mocks.createAiDraft).toHaveBeenCalledWith(mocks.prisma, {
      ownerId: "owner-1",
      source: "telegram_text",
      rawText: "можешь добавить что у меня 280k руб в втб под 0%",
      transcript: undefined,
      parseResult: draft.parsedActions
    });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(draft);
  });
});
