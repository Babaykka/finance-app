import { z } from "zod";
import { dateToMoscowDateIso, MOSCOW_TIMEZONE } from "@/domain/dates";
import { AiParseResultSchema, type AiAction, type AiParseResult } from "@/server/ai/schema";
import type { AiParserContext } from "@/server/ai/parser";

const DEFAULT_PARSE_MODEL = "gpt-5.2";

export const CorrectDraftFromMessageSchema = z.object({
  draftId: z.string().min(1),
  text: z.string().trim().min(1),
  source: z.enum(["telegram_text", "telegram_voice", "web_text", "web_form"]).default("web_text"),
  transcript: z.string().trim().min(1).optional()
});

type CorrectDraftFromMessageInput = z.input<typeof CorrectDraftFromMessageSchema>;

type AmountBearingAction = Extract<
  AiAction,
  { type: "create_storage_place" | "create_debt" | "record_debt_payment" }
>;

const mapParseSourceToDraftSource = (
  source: z.infer<typeof CorrectDraftFromMessageSchema>["source"]
) => {
  if (source === "web_text" || source === "web_form") {
    return "web";
  }

  return source;
};

const normalizeCorrectionText = (text: string) =>
  text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[?.!]+$/u, "")
    .trim();

const parseHumanAmount = (text: string) => {
  const normalized = normalizeCorrectionText(text).toLocaleLowerCase("ru-RU");
  const match = normalized.match(/(?:^|[\s,.;:!?])(\d[\d\s.,]*)(k|к|тыс)?(?:$|[\s,.;:!?])/u);
  if (!match?.[1]) {
    return null;
  }

  const numberText = match[1].replace(/\s+/g, "").replace(",", ".");
  const value = Number(numberText);
  if (!Number.isFinite(value)) {
    return null;
  }

  const multiplier = match[2] ? 1000 : 1;
  const amount = value * multiplier;

  return Number.isInteger(amount) ? amount : Number(amount.toFixed(2));
};

const actionHasAmount = (action: AiAction): action is AmountBearingAction =>
  action.type === "create_storage_place" ||
  action.type === "create_debt" ||
  action.type === "record_debt_payment";

const parseRenameCorrectionName = (text: string) => {
  const cleaned = normalizeCorrectionText(text)
    .replace(/^(?:нет,?\s*)?(?:лучше|назови|название|новое\s+название|пусть\s+будет|сделай)(?:\s+(?:в|на))?\s+/iu, "")
    .trim();

  return cleaned.length > 0 ? cleaned : null;
};

export function applySimpleDraftCorrection(
  parseResult: AiParseResult,
  correctionText: string
): AiParseResult | null {
  if (parseResult.actions.length !== 1) {
    return null;
  }

  const [action] = parseResult.actions;
  if (!action) {
    return null;
  }

  const amount = parseHumanAmount(correctionText);
  if (amount !== null && actionHasAmount(action)) {
    return {
      confidence: 0.95,
      summary: `Исправить сумму на ${amount}.`,
      actions: [
        {
          ...action,
          amount
        }
      ],
      needsClarification: []
    };
  }

  if (action.type === "update_storage_place" && action.name !== undefined) {
    const name = parseRenameCorrectionName(correctionText);
    if (!name) {
      return null;
    }

    return {
      confidence: 0.95,
      summary: `Переименовать ${
        action.currentName ?? action.storagePlaceId ?? "место хранения"
      } в ${name}.`,
      actions: [
        {
          ...action,
          name
        }
      ],
      needsClarification: []
    };
  }

  return null;
}

const toFiniteNumber = (value: unknown, label: string) => {
  const raw = typeof value === "object" && value !== null ? value.toString() : value;
  const amount = typeof raw === "string" && raw.trim().length === 0 ? NaN : Number(raw);

  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid numeric amount for ${label}`);
  }

  return amount;
};

const buildCorrectionParserContext = async (
  db: {
    debt: {
      findMany(input: unknown): Promise<
        Array<{ id: string; partyName: string; remainingAmount: unknown; asset: string }>
      >;
    };
    storagePlace: {
      findMany(input: unknown): Promise<
        Array<{ id: string; name: string; asset: string; amount: unknown }>
      >;
    };
  },
  ownerId: string
): Promise<AiParserContext> => {
  const [debts, storagePlaces] = await Promise.all([
    db.debt.findMany({
      where: { ownerId },
      select: {
        id: true,
        partyName: true,
        remainingAmount: true,
        asset: true
      },
      orderBy: { partyName: "asc" }
    }),
    db.storagePlace.findMany({
      where: { ownerId },
      select: {
        id: true,
        name: true,
        asset: true,
        amount: true
      },
      orderBy: { name: "asc" }
    })
  ]);

  return {
    todayIso: dateToMoscowDateIso(),
    timezone: MOSCOW_TIMEZONE,
    knownDebts: debts.map((debt) => ({
      id: debt.id,
      partyName: debt.partyName,
      remainingAmount: toFiniteNumber(debt.remainingAmount, debt.partyName),
      asset: debt.asset
    })),
    knownStoragePlaces: storagePlaces.map((place) => ({
      id: place.id,
      name: place.name,
      asset: place.asset,
      amount: toFiniteNumber(place.amount, place.name)
    }))
  };
};

const buildCorrectionPrompt = (
  rawText: string,
  parsedActions: AiParseResult,
  correctionText: string
) =>
  [
    "Исправь предыдущий финансовый черновик.",
    `Исходное сообщение пользователя: ${rawText}`,
    `Текущий черновик JSON: ${JSON.stringify(parsedActions)}`,
    `Исправление пользователя: ${correctionText}`,
    "Верни полный новый черновик в поддержанном JSON-формате."
  ].join("\n");

export async function createDraftFromCorrectedMessage(rawInput: CorrectDraftFromMessageInput) {
  const [
    { getLocalOwner },
    { prisma },
    { createOpenAiParser, getOpenAiClient },
    { createAiDraft }
  ] = await Promise.all([
    import("@/server/auth/local-owner"),
    import("@/server/db"),
    import("@/server/ai/openai-adapter"),
    import("@/server/services/draft-service")
  ]);
  const body = CorrectDraftFromMessageSchema.parse(rawInput);
  const owner = await getLocalOwner();
  const oldDraft = await prisma.aiDraft.findFirstOrThrow({
    where: {
      id: body.draftId,
      ownerId: owner.id,
      status: { in: ["pending", "needs_clarification"] }
    }
  });
  const oldParseResult = AiParseResultSchema.parse(oldDraft.parsedActions);
  const parseResult =
    applySimpleDraftCorrection(oldParseResult, body.text) ??
    (await createOpenAiParser(
      getOpenAiClient(),
      process.env.OPENAI_PARSE_MODEL ?? DEFAULT_PARSE_MODEL
    ).parseMessage({
      text: buildCorrectionPrompt(oldDraft.rawText, oldParseResult, body.text),
      context: await buildCorrectionParserContext(prisma, owner.id)
    }));

  return prisma.$transaction(async (tx) => {
    await tx.aiDraft.updateMany({
      where: {
        id: body.draftId,
        ownerId: owner.id,
        status: { in: ["pending", "needs_clarification"] }
      },
      data: { status: "rejected" }
    });

    return createAiDraft(tx, {
      ownerId: owner.id,
      source: mapParseSourceToDraftSource(body.source),
      rawText: `${oldDraft.rawText}\nИсправление: ${body.text}`,
      transcript: body.transcript,
      parseResult
    });
  });
}
