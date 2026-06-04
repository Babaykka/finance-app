import { NextResponse } from "next/server";
import { z } from "zod";
import type { OpenAiTranscriptionClient } from "@/server/ai/transcription";
import { processTelegramUpdate, TelegramUpdateSchema } from "@/server/telegram/update";

const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";

const getRouteDependencies = async () => {
  const [
    { getOpenAiClient },
    { transcribeAudioFile },
    { answerTelegramCallbackQuery, sendTelegramMessage },
    { downloadTelegramVoiceFile }
  ] = await Promise.all([
    import("@/server/ai/openai-adapter"),
    import("@/server/ai/transcription"),
    import("@/server/telegram/client"),
    import("@/server/telegram/voice")
  ]);

  return {
    getOpenAiClient,
    transcribeAudioFile,
    answerTelegramCallbackQuery,
    sendTelegramMessage,
    downloadTelegramVoiceFile
  };
};

const getRequiredBotToken = () => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }

  return botToken;
};

const validateWebhookSecret = (request: Request) => {
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "TELEGRAM_WEBHOOK_SECRET is required" }, { status: 403 });
  }

  const actualSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (actualSecret !== webhookSecret) {
    return NextResponse.json({ error: "Telegram webhook secret mismatch" }, { status: 403 });
  }

  return null;
};

const getInternalAccessHeaders = (): Record<string, string> => {
  const internalSecret = process.env.INTERNAL_API_SECRET ?? process.env.TELEGRAM_WEBHOOK_SECRET;

  return internalSecret ? { "X-Finance-Internal-Secret": internalSecret } : {};
};

const postToParseMessage = async (request: Request, body: unknown) => {
  const parseResponse = await fetch(new URL("/api/parse-message", request.url), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getInternalAccessHeaders() },
    body: JSON.stringify(body)
  });

  if (!parseResponse.ok) {
    throw new Error(`parse-message failed with HTTP ${parseResponse.status}`);
  }

  return parseResponse.json() as Promise<{ id: string; parsedActions: unknown }>;
};

const postToLocalRoute = async (request: Request, path: string) => {
  const response = await fetch(new URL(path, request.url).toString(), {
    method: "POST",
    headers: getInternalAccessHeaders()
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  return {
    ok: response.ok,
    status: response.status,
    body
  };
};

export async function POST(request: Request) {
  const webhookSecretFailure = validateWebhookSecret(request);
  if (webhookSecretFailure) {
    return webhookSecretFailure;
  }

  let update: z.infer<typeof TelegramUpdateSchema>;

  try {
    update = TelegramUpdateSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid Telegram webhook payload" }, { status: 400 });
  }

  const botToken = getRequiredBotToken();
  const {
    answerTelegramCallbackQuery,
    downloadTelegramVoiceFile,
    getOpenAiClient,
    sendTelegramMessage,
    transcribeAudioFile
  } = await getRouteDependencies();
  const result = await processTelegramUpdate({
    update,
    fetcher: fetch,
    botToken,
    allowedUserId: process.env.TELEGRAM_ALLOWED_USER_ID,
    transcribeModel: process.env.OPENAI_TRANSCRIBE_MODEL ?? DEFAULT_TRANSCRIBE_MODEL,
    parseMessage: (body) => postToParseMessage(request, body),
    confirmDraft: (draftId) =>
      postToLocalRoute(request, `/api/ai-drafts/${encodeURIComponent(draftId)}/confirm`),
    rejectDraft: (draftId) =>
      postToLocalRoute(request, `/api/ai-drafts/${encodeURIComponent(draftId)}/reject`),
    sendTelegramMessage,
    answerTelegramCallbackQuery,
    downloadTelegramVoiceFile,
    transcribeAudioFile: (client, input) => transcribeAudioFile(client, input),
    getOpenAiClient: () => getOpenAiClient() as unknown as OpenAiTranscriptionClient
  });

  return NextResponse.json(result);
}
