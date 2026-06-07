import { z } from "zod";
import { dateToMoscowDateIso, MOSCOW_TIMEZONE } from "@/domain/dates";
import type { Source } from "@/domain/enums";
import type { AiParserContext } from "@/server/ai/parser";
import { createOpenAiParser, getOpenAiClient } from "@/server/ai/openai-adapter";
import { prisma } from "@/server/db";
import { getLocalOwner } from "@/server/auth/local-owner";
import { createAiDraft } from "@/server/services/draft-service";
import { AiParseResultSchema } from "@/server/ai/schema";

const DEFAULT_PARSE_MODEL = "gpt-5.2";

export const ParseMessageRequestSchema = z.object({
  text: z.string().trim().min(1),
  source: z
    .enum(["telegram_text", "telegram_voice", "web_text", "web_form"])
    .default("web_text"),
  transcript: z.string().trim().min(1).optional()
});

export const CreateDraftFromParseResultRequestSchema = z.object({
  text: z.string().trim().min(1),
  source: z.enum(["telegram_text", "telegram_voice", "web_text", "web_form"]).default("web_text"),
  transcript: z.string().trim().min(1).optional(),
  parseResult: AiParseResultSchema
});

type ParseMessageSource = z.infer<typeof ParseMessageRequestSchema>["source"];

const mapParseSourceToDraftSource = (source: ParseMessageSource): Source => {
  if (source === "web_text" || source === "web_form") {
    return "web";
  }

  return source;
};

const toFiniteNumber = (value: unknown, label: string) => {
  const raw = typeof value === "object" && value !== null ? value.toString() : value;
  const amount = typeof raw === "string" && raw.trim().length === 0 ? NaN : Number(raw);

  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid numeric amount for ${label}`);
  }

  return amount;
};

export async function createDraftFromParsedMessage(rawInput: unknown) {
  const body = ParseMessageRequestSchema.parse(rawInput);
  const owner = await getLocalOwner();

  const [debts, storagePlaces] = await Promise.all([
    prisma.debt.findMany({
      where: { ownerId: owner.id },
      select: {
        id: true,
        partyName: true,
        remainingAmount: true,
        asset: true
      },
      orderBy: { partyName: "asc" }
    }),
    prisma.storagePlace.findMany({
      where: { ownerId: owner.id },
      select: {
        id: true,
        name: true,
        asset: true,
        amount: true
      },
      orderBy: { name: "asc" }
    })
  ]);

  const context: AiParserContext = {
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
  const parser = createOpenAiParser(
    getOpenAiClient(),
    process.env.OPENAI_PARSE_MODEL ?? DEFAULT_PARSE_MODEL
  );
  const parseResult = await parser.parseMessage({
    text: body.text,
    context
  });

  return createAiDraft(prisma, {
    ownerId: owner.id,
    source: mapParseSourceToDraftSource(body.source),
    rawText: body.text,
    transcript: body.transcript,
    parseResult
  });
}

export async function createDraftFromParseResult(rawInput: unknown) {
  const body = CreateDraftFromParseResultRequestSchema.parse(rawInput);
  const owner = await getLocalOwner();

  return createAiDraft(prisma, {
    ownerId: owner.id,
    source: mapParseSourceToDraftSource(body.source),
    rawText: body.text,
    transcript: body.transcript,
    parseResult: body.parseResult
  });
}
