import { dateToMoscowDateIso, MOSCOW_TIMEZONE } from "@/domain/dates";
import { createOpenAiAssistantResponder } from "@/server/ai/assistant-adapter";
import type { FinanceAssistantContext } from "@/server/ai/assistant-adapter";
import { getOpenAiClient } from "@/server/ai/openai-adapter";
import { rememberAssistantExchange } from "@/server/services/assistant-memory-service";

const DEFAULT_ASSISTANT_MODEL = "gpt-5.2";

type DecimalLike = {
  toString(): string;
};

type AssistantDb = {
  storagePlace: {
    findMany(input: unknown): Promise<
      Array<{
        name: string;
        type: string;
        subtype: string;
        holderContext: string;
        asset: string;
        amount: DecimalLike | string | number;
        rate: DecimalLike | string | number | null;
        availability: string;
        interestPaymentDay: number | null;
        comment: string | null;
      }>
    >;
  };
  debt: {
    findMany(input: unknown): Promise<
      Array<{
        partyName: string;
        type: string;
        basis: string;
        asset: string;
        remainingAmount: DecimalLike | string | number;
        status: string;
        nextPaymentAmount: DecimalLike | string | number | null;
        nextPaymentDate: Date | string | null;
        comment: string | null;
      }>
    >;
  };
  aiDraft: {
    count(input: unknown): Promise<number>;
  };
  assistantMemory: {
    findMany(input: unknown): Promise<
      Array<{
        kind: string;
        text: string;
      }>
    >;
  };
  assistantMessage: {
    findMany(input: unknown): Promise<
      Array<{
        role: string;
        source: string;
        text: string;
        createdAt: Date | string;
      }>
    >;
  };
};

const toFiniteNumber = (value: unknown, label: string) => {
  const raw = typeof value === "object" && value !== null ? value.toString() : value;
  const amount = typeof raw === "string" && raw.trim().length === 0 ? NaN : Number(raw);

  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid numeric amount for ${label}`);
  }

  return amount;
};

const toIsoDate = (value: Date | string | null) => {
  if (value === null) {
    return null;
  }

  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
};

const toIsoDateTime = (value: Date | string) =>
  typeof value === "string" ? new Date(value).toISOString() : value.toISOString();

const sortAssetTotals = (totals: Array<{ asset: string; amount: number }>) =>
  totals.sort((left, right) => left.asset.localeCompare(right.asset, "en"));

export async function buildFinanceAssistantContext(
  db: AssistantDb,
  input: { ownerId: string; todayIso: string; timezone: string }
): Promise<FinanceAssistantContext> {
  const [storagePlaces, debts, pendingDraftCount, memories, recentMessages] = await Promise.all([
    db.storagePlace.findMany({
      where: { ownerId: input.ownerId, status: { not: "closed" } },
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
    }),
    db.debt.findMany({
      where: { ownerId: input.ownerId, status: { not: "closed" } },
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
    }),
    db.aiDraft.count({
      where: { ownerId: input.ownerId, status: { in: ["pending", "needs_clarification"] } }
    }),
    db.assistantMemory.findMany({
      where: { ownerId: input.ownerId, status: "active" },
      select: { kind: true, text: true },
      orderBy: { updatedAt: "desc" },
      take: 30
    }),
    db.assistantMessage.findMany({
      where: { ownerId: input.ownerId },
      select: { role: true, source: true, text: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 12
    })
  ]);

  const assetAmountByCode = new Map<string, number>();
  const storageContext = storagePlaces.map((place) => {
    const amount = toFiniteNumber(place.amount, place.name);
    assetAmountByCode.set(place.asset, (assetAmountByCode.get(place.asset) ?? 0) + amount);

    return {
      name: place.name,
      type: place.type,
      subtype: place.subtype,
      holderContext: place.holderContext,
      asset: place.asset,
      amount,
      rate: place.rate === null ? null : toFiniteNumber(place.rate, `${place.name}.rate`),
      availability: place.availability,
      interestPaymentDay: place.interestPaymentDay,
      comment: place.comment
    };
  });

  return {
    todayIso: input.todayIso,
    timezone: input.timezone,
    memories: memories.map((memory) => ({
      kind: memory.kind,
      text: memory.text
    })),
    recentMessages: [...recentMessages].reverse().map((message) => ({
      role: message.role,
      source: message.source,
      text: message.text,
      createdAt: toIsoDateTime(message.createdAt)
    })),
    assetTotals: sortAssetTotals(
      [...assetAmountByCode.entries()].map(([asset, amount]) => ({ asset, amount }))
    ),
    storagePlaces: storageContext,
    debts: debts.map((debt) => ({
      partyName: debt.partyName,
      type: debt.type,
      basis: debt.basis,
      asset: debt.asset,
      remainingAmount: toFiniteNumber(debt.remainingAmount, debt.partyName),
      status: debt.status,
      nextPaymentAmount:
        debt.nextPaymentAmount === null
          ? null
          : toFiniteNumber(debt.nextPaymentAmount, `${debt.partyName}.nextPaymentAmount`),
      nextPaymentDate: toIsoDate(debt.nextPaymentDate),
      comment: debt.comment
    })),
    pendingDraftCount
  };
}

export async function answerTelegramAssistantMessage(input: {
  text: string;
  telegramUserId: string;
  source: "telegram_text" | "telegram_voice";
  transcript?: string;
}) {
  const [{ getLocalOwner }, { prisma }] = await Promise.all([
    import("@/server/auth/local-owner"),
    import("@/server/db")
  ]);
  const owner = await getLocalOwner();
  const context = await buildFinanceAssistantContext(prisma, {
    ownerId: owner.id,
    todayIso: dateToMoscowDateIso(),
    timezone: MOSCOW_TIMEZONE
  });
  const responder = createOpenAiAssistantResponder(
    getOpenAiClient(),
    process.env.OPENAI_ASSISTANT_MODEL ?? process.env.OPENAI_PARSE_MODEL ?? DEFAULT_ASSISTANT_MODEL
  );

  const answer = await responder.answerMessage({
    text: input.text,
    context
  });

  try {
    await rememberAssistantExchange(prisma, {
      ownerId: owner.id,
      source: input.source,
      userText: input.text,
      assistantText: answer.text
    });
  } catch (error) {
    console.warn("Assistant memory write failed:", error);
  }

  return answer;
}
