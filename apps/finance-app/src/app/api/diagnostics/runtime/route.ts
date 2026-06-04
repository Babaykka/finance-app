import OpenAI from "openai";
import { NextResponse } from "next/server";
import { hasInternalAccess } from "@/server/auth/internal-access";

const DEFAULT_PARSE_MODEL = "gpt-4o-mini";

const getRouteDependencies = async () => {
  const [{ prisma }, { getLocalOwner }] = await Promise.all([
    import("@/server/db"),
    import("@/server/auth/local-owner")
  ]);

  return { prisma, getLocalOwner };
};

const getOpenAiErrorDetails = (error: unknown) => {
  const record = typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};

  return {
    status: typeof record.status === "number" ? record.status : null,
    code: typeof record.code === "string" ? record.code : null,
    type: typeof record.type === "string" ? record.type : null
  };
};

export async function GET(request: Request) {
  if (!hasInternalAccess(request.headers)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parseModel = process.env.OPENAI_PARSE_MODEL ?? DEFAULT_PARSE_MODEL;
  const env = {
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    hasOwnerTelegramUserId: Boolean(process.env.OWNER_TELEGRAM_USER_ID),
    hasTelegramAllowedUserId: Boolean(process.env.TELEGRAM_ALLOWED_USER_ID),
    hasTelegramBotToken: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    hasTelegramWebhookSecret: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
    hasOpenAiApiKey: Boolean(process.env.OPENAI_API_KEY),
    parseModel
  };

  const database = {
    ok: false,
    ownerId: null as string | null,
    debtsCount: null as number | null,
    storagePlacesCount: null as number | null,
    error: null as string | null
  };

  try {
    const { prisma, getLocalOwner } = await getRouteDependencies();
    const owner = await getLocalOwner();
    const [debtsCount, storagePlacesCount] = await Promise.all([
      prisma.debt.count({ where: { ownerId: owner.id } }),
      prisma.storagePlace.count({ where: { ownerId: owner.id } })
    ]);

    database.ok = true;
    database.ownerId = owner.id;
    database.debtsCount = debtsCount;
    database.storagePlacesCount = storagePlacesCount;
  } catch {
    database.error = "database_check_failed";
  }

  const openai = {
    ok: false,
    modelAvailable: false,
    error: null as string | null,
    status: null as number | null,
    code: null as string | null,
    type: null as string | null
  };

  if (!process.env.OPENAI_API_KEY) {
    openai.error = "missing_openai_api_key";
  } else {
    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      await client.models.retrieve(parseModel);
      openai.ok = true;
      openai.modelAvailable = true;
    } catch (error) {
      openai.error = "openai_model_check_failed";
      Object.assign(openai, getOpenAiErrorDetails(error));
    }
  }

  return NextResponse.json({
    ok: database.ok && openai.ok,
    env,
    database,
    openai
  });
}
