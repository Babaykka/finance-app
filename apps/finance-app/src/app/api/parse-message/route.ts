import { NextResponse } from "next/server";
import { z } from "zod";
import type { Source } from "@/domain/enums";
import type { AiParserContext } from "@/server/ai/parser";

const MOSCOW_TIMEZONE = "Europe/Moscow";
const DEFAULT_PARSE_MODEL = "gpt-5.4-nano";

export const ParseMessageRequestSchema = z.object({
  text: z.string().trim().min(1),
  source: z
    .enum(["telegram_text", "telegram_voice", "web_text", "web_form"])
    .default("web_text"),
  transcript: z.string().trim().min(1).optional()
});

type ParseMessageSource = z.infer<typeof ParseMessageRequestSchema>["source"];

const getRouteDependencies = async () => {
  const [{ prisma }, { getLocalOwner }, { createAiDraft }, { createOpenAiParser, getOpenAiClient }] =
    await Promise.all([
      import("@/server/db"),
      import("@/server/auth/local-owner"),
      import("@/server/services/draft-service"),
      import("@/server/ai/openai-adapter")
    ]);

  return { prisma, getLocalOwner, createAiDraft, createOpenAiParser, getOpenAiClient };
};

const mapParseSourceToDraftSource = (source: ParseMessageSource): Source => {
  if (source === "web_text" || source === "web_form") {
    return "web";
  }

  return source;
};

const getMoscowTodayIso = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MOSCOW_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${valueByType.year}-${valueByType.month}-${valueByType.day}`;
};

const toFiniteNumber = (value: unknown, label: string) => {
  const raw = typeof value === "object" && value !== null ? value.toString() : value;
  const amount = typeof raw === "string" && raw.trim().length === 0 ? NaN : Number(raw);

  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid numeric amount for ${label}`);
  }

  return amount;
};

export async function POST(request: Request) {
  const body = ParseMessageRequestSchema.parse(await request.json());
  const { prisma, getLocalOwner, createAiDraft, createOpenAiParser, getOpenAiClient } =
    await getRouteDependencies();
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
    todayIso: getMoscowTodayIso(),
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
  const draft = await createAiDraft(prisma, {
    ownerId: owner.id,
    source: mapParseSourceToDraftSource(body.source),
    rawText: body.text,
    transcript: body.transcript,
    parseResult
  });

  return NextResponse.json(draft, { status: 201 });
}
