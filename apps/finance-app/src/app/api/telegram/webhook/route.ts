import { NextResponse } from "next/server";
import { z } from "zod";
import type { OpenAiTranscriptionClient } from "@/server/ai/transcription";
import { processTelegramUpdate, TelegramUpdateSchema } from "@/server/telegram/update";

const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";
const TELEGRAM_TYPING_HEARTBEAT_MS = 4000;
const TELEGRAM_PROGRESSIVE_MESSAGE_LIMIT = 900;

type DraftMutationRouteHandler = (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => Promise<Response>;

const getRouteDependencies = async () => {
  const [
    { getOpenAiClient },
    { createDraftFromParsedMessage, createDraftFromParseResult },
    { answerTelegramAssistantMessage },
    { createDraftFromCorrectedMessage },
    { transcribeAudioFile },
    { answerTelegramCallbackQuery, sendTelegramChatAction, sendTelegramMessage },
    { downloadTelegramVoiceFile },
    {
      clearTelegramConversationState,
      getTelegramConversationState,
      setTelegramConversationState
    },
    { prisma },
    { POST: confirmAiDraftRoute },
    { POST: rejectAiDraftRoute }
  ] = await Promise.all([
    import("@/server/ai/openai-adapter"),
    import("@/server/services/parse-message-service"),
    import("@/server/services/assistant-message-service"),
    import("@/server/services/draft-correction-service"),
    import("@/server/ai/transcription"),
    import("@/server/telegram/client"),
    import("@/server/telegram/voice"),
    import("@/server/services/telegram-conversation-state-service"),
    import("@/server/db"),
    import("@/app/api/ai-drafts/[id]/confirm/route"),
    import("@/app/api/ai-drafts/[id]/reject/route")
  ]);

  return {
    createDraftFromParsedMessage,
    createDraftFromParseResult,
    answerTelegramAssistantMessage,
    createDraftFromCorrectedMessage,
    getOpenAiClient,
    transcribeAudioFile,
    answerTelegramCallbackQuery,
    sendTelegramChatAction,
    sendTelegramMessage,
    downloadTelegramVoiceFile,
    clearTelegramConversationState,
    getTelegramConversationState,
    setTelegramConversationState,
    prisma,
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

const getUpdateChatId = (update: z.infer<typeof TelegramUpdateSchema>) => {
  const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;

  return typeof chatId === "number" ? chatId : null;
};

const getUpdateCallbackQueryId = (update: z.infer<typeof TelegramUpdateSchema>) =>
  update.callback_query?.id ?? null;

const getUpdateMessageChatId = (update: z.infer<typeof TelegramUpdateSchema>) => {
  const chatId = update.message?.chat.id;

  return typeof chatId === "number" ? chatId : null;
};

const getUpdateMessageTelegramUserId = (update: z.infer<typeof TelegramUpdateSchema>) => {
  const telegramUserId = update.message?.from.id;

  return typeof telegramUserId === "number" ? String(telegramUserId) : null;
};

const shouldShowTypingForUpdate = (
  update: z.infer<typeof TelegramUpdateSchema>,
  allowedUserId?: string
) => {
  const telegramUserId = getUpdateMessageTelegramUserId(update);

  return telegramUserId !== null && (!allowedUserId || telegramUserId === allowedUserId);
};

const callAndLog = (operation: () => Promise<unknown>, label: string) => {
  Promise.resolve()
    .then(operation)
    .catch((error) => console.warn(label, error));
};

const unrefTimer = (timer: ReturnType<typeof setInterval>) => {
  if (typeof timer === "object" && timer !== null && "unref" in timer) {
    (timer as { unref: () => void }).unref();
  }
};

function startTelegramTypingHeartbeat(input: {
  update: z.infer<typeof TelegramUpdateSchema>;
  fetcher: typeof fetch;
  botToken: string;
  allowedUserId?: string;
  sendTelegramChatAction: Awaited<
    ReturnType<typeof getRouteDependencies>
  >["sendTelegramChatAction"];
}) {
  if (!shouldShowTypingForUpdate(input.update, input.allowedUserId)) {
    return () => undefined;
  }

  const chatId = getUpdateMessageChatId(input.update);
  if (chatId === null) {
    return () => undefined;
  }

  let active = true;
  const sendTyping = () => {
    if (!active) {
      return;
    }

    callAndLog(
      () =>
        input.sendTelegramChatAction({
          fetcher: input.fetcher,
          botToken: input.botToken,
          chatId,
          action: "typing"
        }),
      "Telegram typing heartbeat failed:"
    );
  };

  sendTyping();
  const timer = setInterval(sendTyping, TELEGRAM_TYPING_HEARTBEAT_MS);
  unrefTimer(timer);

  return () => {
    active = false;
    clearInterval(timer);
  };
}

const findTelegramChunkBreak = (text: string, limit: number) => {
  const preferredBreaks = ["\n\n", "\n", ". ", "! ", "? ", "; ", ", ", " "];
  const minimumBreak = Math.floor(limit * 0.45);

  for (const marker of preferredBreaks) {
    const index = text.lastIndexOf(marker, limit);
    if (index >= minimumBreak) {
      return index + marker.length;
    }
  }

  return limit;
};

const splitTelegramMessageText = (
  text: string,
  limit = TELEGRAM_PROGRESSIVE_MESSAGE_LIMIT
) => {
  if (text.length <= limit) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > limit) {
    const splitAt = findTelegramChunkBreak(remaining, limit);
    const chunk = remaining.slice(0, splitAt).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
};

async function sendTelegramMessageProgressively(
  input: Parameters<Awaited<ReturnType<typeof getRouteDependencies>>["sendTelegramMessage"]>[0],
  sendTelegramMessage: Awaited<ReturnType<typeof getRouteDependencies>>["sendTelegramMessage"]
) {
  if (input.buttons.length > 0 || input.text.length <= TELEGRAM_PROGRESSIVE_MESSAGE_LIMIT) {
    await sendTelegramMessage(input);
    return;
  }

  for (const chunk of splitTelegramMessageText(input.text)) {
    await sendTelegramMessage({
      ...input,
      text: chunk,
      buttons: []
    });
  }
}

async function notifyTelegramProcessingFailure(input: {
  update: z.infer<typeof TelegramUpdateSchema>;
  fetcher: typeof fetch;
  botToken: string;
  userVisibleTelegramSendAttempted: boolean;
  callbackAnswerAttempted: boolean;
  sendTelegramMessage: Awaited<ReturnType<typeof getRouteDependencies>>["sendTelegramMessage"];
  answerTelegramCallbackQuery: Awaited<
    ReturnType<typeof getRouteDependencies>
  >["answerTelegramCallbackQuery"];
}) {
  const callbackQueryId = getUpdateCallbackQueryId(input.update);
  if (callbackQueryId && !input.callbackAnswerAttempted) {
    try {
      await input.answerTelegramCallbackQuery({
        fetcher: input.fetcher,
        botToken: input.botToken,
        callbackQueryId,
        text: "Не получилось"
      });
    } catch (error) {
      console.warn("Telegram callback failure notification failed:", error);
    }
  }

  if (input.userVisibleTelegramSendAttempted) {
    return;
  }

  const chatId = getUpdateChatId(input.update);
  if (chatId === null) {
    return;
  }

  try {
    await input.sendTelegramMessage({
      fetcher: input.fetcher,
      botToken: input.botToken,
      chatId,
      text: callbackQueryId
        ? "Не получилось обработать кнопку. Попробуй нажать еще раз."
        : "Не получилось обработать сообщение. Я уже вижу сбой, попробуй отправить еще раз или чуть проще.",
      buttons: []
    });
  } catch (error) {
    console.warn("Telegram message failure notification failed:", error);
  }
}

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
    clearTelegramConversationState,
    confirmAiDraftRoute,
    createDraftFromCorrectedMessage,
    createDraftFromParseResult,
    createDraftFromParsedMessage,
    downloadTelegramVoiceFile,
    getTelegramConversationState,
    getOpenAiClient,
    rejectAiDraftRoute,
    sendTelegramChatAction,
    sendTelegramMessage,
    setTelegramConversationState,
    prisma,
    transcribeAudioFile
  } = await getRouteDependencies();
  let result: unknown;
  let userVisibleTelegramSendAttempted = false;
  let callbackAnswerAttempted = false;
  const stopTypingHeartbeat = startTelegramTypingHeartbeat({
    update,
    fetcher: fetch,
    botToken,
    allowedUserId: process.env.TELEGRAM_ALLOWED_USER_ID,
    sendTelegramChatAction
  });
  const sendUserVisibleTelegramMessage: typeof sendTelegramMessage = async (input) => {
    userVisibleTelegramSendAttempted = true;
    await sendTelegramMessageProgressively(input, sendTelegramMessage);
  };
  const answerUserVisibleTelegramCallback: typeof answerTelegramCallbackQuery = async (input) => {
    callbackAnswerAttempted = true;
    await answerTelegramCallbackQuery(input);
  };

  try {
    result = await processTelegramUpdate({
      update,
      fetcher: fetch,
      botToken,
      allowedUserId: process.env.TELEGRAM_ALLOWED_USER_ID,
      transcribeModel: process.env.OPENAI_TRANSCRIBE_MODEL ?? DEFAULT_TRANSCRIBE_MODEL,
      parseMessage: createDraftFromParsedMessage,
      createDraftFromParseResult,
      correctDraft: createDraftFromCorrectedMessage,
      answerMessage: answerTelegramAssistantMessage,
      confirmDraft: (draftId) => callDraftMutationRoute(confirmAiDraftRoute, draftId),
      rejectDraft: (draftId) => callDraftMutationRoute(rejectAiDraftRoute, draftId),
      getConversationState: (telegramUserId) =>
        getTelegramConversationState(prisma, { telegramUserId }),
      setConversationState: (state) => setTelegramConversationState(prisma, state),
      clearConversationState: (telegramUserId) =>
        clearTelegramConversationState(prisma, telegramUserId),
      sendTelegramMessage: sendUserVisibleTelegramMessage,
      answerTelegramCallbackQuery: answerUserVisibleTelegramCallback,
      downloadTelegramVoiceFile,
      transcribeAudioFile: (client, input) => transcribeAudioFile(client, input),
      getOpenAiClient: () => getOpenAiClient() as unknown as OpenAiTranscriptionClient
    });
  } catch (error) {
    console.warn("Telegram update processing failed:", error);
    await notifyTelegramProcessingFailure({
      update,
      fetcher: fetch,
      botToken,
      userVisibleTelegramSendAttempted,
      callbackAnswerAttempted,
      sendTelegramMessage,
      answerTelegramCallbackQuery
    });

    return NextResponse.json({ ok: false, error: "Telegram update processing failed" });
  } finally {
    stopTypingHeartbeat();
  }

  return NextResponse.json(result);
}
