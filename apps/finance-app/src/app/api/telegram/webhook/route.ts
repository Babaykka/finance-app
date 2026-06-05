import { NextResponse } from "next/server";
import { z } from "zod";
import type { OpenAiTranscriptionClient } from "@/server/ai/transcription";
import { processTelegramUpdate, TelegramUpdateSchema } from "@/server/telegram/update";

const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";
type DraftMutationRouteHandler = (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => Promise<Response>;

const getRouteDependencies = async () => {
  const [
    { getOpenAiClient },
    { createDraftFromParsedMessage },
    { answerTelegramAssistantMessage },
    { transcribeAudioFile },
    { answerTelegramCallbackQuery, sendTelegramMessage },
    { downloadTelegramVoiceFile },
    { POST: confirmAiDraftRoute },
    { POST: rejectAiDraftRoute }
  ] = await Promise.all([
    import("@/server/ai/openai-adapter"),
    import("@/server/services/parse-message-service"),
    import("@/server/services/assistant-message-service"),
    import("@/server/ai/transcription"),
    import("@/server/telegram/client"),
    import("@/server/telegram/voice"),
    import("@/app/api/ai-drafts/[id]/confirm/route"),
    import("@/app/api/ai-drafts/[id]/reject/route")
  ]);

  return {
    createDraftFromParsedMessage,
    answerTelegramAssistantMessage,
    getOpenAiClient,
    transcribeAudioFile,
    answerTelegramCallbackQuery,
    sendTelegramMessage,
    downloadTelegramVoiceFile,
    confirmAiDraftRoute: confirmAiDraftRoute as DraftMutationRouteHandler,
    rejectAiDraftRoute: rejectAiDraftRoute as DraftMutationRouteHandler
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

const callDraftMutationRoute = async (handler: DraftMutationRouteHandler, draftId: string) => {
  const response = await handler(new Request("http://finance-app.internal"), {
    params: Promise.resolve({ id: draftId })
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
    answerTelegramAssistantMessage,
    confirmAiDraftRoute,
    createDraftFromParsedMessage,
    downloadTelegramVoiceFile,
    getOpenAiClient,
    rejectAiDraftRoute,
    sendTelegramMessage,
    transcribeAudioFile
  } = await getRouteDependencies();
  let result: unknown;
  const sendUserVisibleTelegramMessage: typeof sendTelegramMessage = async (input) => {
    await sendTelegramMessage(input);
  };

  try {
    result = await processTelegramUpdate({
      update,
      fetcher: fetch,
      botToken,
      allowedUserId: process.env.TELEGRAM_ALLOWED_USER_ID,
      transcribeModel: process.env.OPENAI_TRANSCRIBE_MODEL ?? DEFAULT_TRANSCRIBE_MODEL,
      parseMessage: createDraftFromParsedMessage,
      answerMessage: answerTelegramAssistantMessage,
      confirmDraft: (draftId) => callDraftMutationRoute(confirmAiDraftRoute, draftId),
      rejectDraft: (draftId) => callDraftMutationRoute(rejectAiDraftRoute, draftId),
      sendTelegramMessage: sendUserVisibleTelegramMessage,
      answerTelegramCallbackQuery,
      downloadTelegramVoiceFile,
      transcribeAudioFile: (client, input) => transcribeAudioFile(client, input),
      getOpenAiClient: () => getOpenAiClient() as unknown as OpenAiTranscriptionClient
    });
  } catch (error) {
    console.warn("Telegram update processing failed:", error);

    return NextResponse.json({ ok: false, error: "Telegram update processing failed" });
  }

  return NextResponse.json(result);
}
