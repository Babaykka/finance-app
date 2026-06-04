import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getOpenAiApiKey, normalizeOpenAiApiKey } from "@/server/ai/api-key";
import { hasInternalAccess } from "@/server/auth/internal-access";

const DEFAULT_PARSE_MODEL = "gpt-4o-mini";

const getRouteDependencies = async () => {
  const [{ prisma }, { getLocalOwner }] = await Promise.all([
    import("@/server/db"),
    import("@/server/auth/local-owner")
  ]);

  return { prisma, getLocalOwner };
};

const sanitizeOpenAiMessage = (value: unknown) =>
  typeof value === "string"
    ? value
        .replace(/sk-[A-Za-z0-9_-]+/g, "sk-***")
        .replace(/Bearer\s+[^\s,;]+/gi, "Bearer ***")
        .slice(0, 300)
    : null;

const getOpenAiErrorDetails = (error: unknown) => {
  const record = typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
  const cause =
    typeof record.cause === "object" && record.cause !== null
      ? (record.cause as Record<string, unknown>)
      : {};

  return {
    name: typeof record.name === "string" ? record.name : null,
    message: sanitizeOpenAiMessage(record.message),
    status: typeof record.status === "number" ? record.status : null,
    code: typeof record.code === "string" ? record.code : null,
    type: typeof record.type === "string" ? record.type : null,
    causeName: typeof cause.name === "string" ? cause.name : null,
    causeMessage: sanitizeOpenAiMessage(cause.message)
  };
};

const checkOpenAiModelOverHttp = async (apiKey: string, model: string) => {
  try {
    const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    let body: unknown = null;

    try {
      body = await response.json();
    } catch {
      body = null;
    }

    const error =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "object" &&
      body.error !== null
        ? (body.error as Record<string, unknown>)
        : {};

    return {
      ok: response.ok,
      status: response.status,
      code: typeof error.code === "string" ? error.code : null,
      type: typeof error.type === "string" ? error.type : null,
      message: sanitizeOpenAiMessage(error.message)
    };
  } catch (error) {
    return {
      ok: false,
      ...getOpenAiErrorDetails(error),
      status: null
    };
  }
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
    hasOpenAiApiKey: Boolean(normalizeOpenAiApiKey(process.env.OPENAI_API_KEY)),
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
    name: null as string | null,
    message: null as string | null,
    status: null as number | null,
    code: null as string | null,
    type: null as string | null,
    causeName: null as string | null,
    causeMessage: null as string | null,
    http: null as Awaited<ReturnType<typeof checkOpenAiModelOverHttp>> | null
  };

  const openAiApiKey = normalizeOpenAiApiKey(process.env.OPENAI_API_KEY);
  if (!openAiApiKey) {
    openai.error = "missing_openai_api_key";
  } else {
    openai.http = await checkOpenAiModelOverHttp(openAiApiKey, parseModel);

    try {
      const client = new OpenAI({ apiKey: getOpenAiApiKey() });
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
