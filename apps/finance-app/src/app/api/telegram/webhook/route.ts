import { NextResponse } from "next/server";
import { z } from "zod";
import type { OpenAiTranscriptionClient } from "@/server/ai/transcription";

const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";

const TelegramMessageSchema = z.object({
  chat: z.object({ id: z.number() }),
  from: z.object({ id: z.number() }),
  text: z.string().optional(),
  voice: z.object({ file_id: z.string().min(1) }).optional()
});

const TelegramUpdateSchema = z.object({
  message: TelegramMessageSchema.optional(),
  callback_query: z
    .object({
      data: z.string().optional()
    })
    .optional()
});

type TelegramMessage = z.infer<typeof TelegramMessageSchema>;

const getRouteDependencies = async () => {
  const [
    { getOpenAiClient },
    { transcribeAudioFile },
    { buildTelegramDraftConfirmation, handleTelegramTextMessage },
    { sendTelegramMessage },
    { downloadTelegramVoiceFile }
  ] = await Promise.all([
    import("@/server/ai/openai-adapter"),
    import("@/server/ai/transcription"),
    import("@/server/telegram/bot"),
    import("@/server/telegram/client"),
    import("@/server/telegram/voice")
  ]);

  return {
    getOpenAiClient,
    transcribeAudioFile,
    buildTelegramDraftConfirmation,
    handleTelegramTextMessage,
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

const getTelegramUserId = (message: TelegramMessage) => String(message.from.id);

const isAllowedTelegramUser = (telegramUserId: string) => {
  const allowedUserId = process.env.TELEGRAM_ALLOWED_USER_ID;
  return !allowedUserId || allowedUserId === telegramUserId;
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

const postToParseMessage = async (request: Request, body: unknown) => {
  const parseResponse = await fetch(new URL("/api/parse-message", request.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!parseResponse.ok) {
    throw new Error(`parse-message failed with HTTP ${parseResponse.status}`);
  }

  return parseResponse.json() as Promise<{ id: string; parsedActions: unknown }>;
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

  if (update.callback_query) {
    return NextResponse.json({
      ok: true,
      handled: "callback",
      callbackData: update.callback_query.data
    });
  }

  if (!update.message) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const message = update.message;
  const telegramUserId = getTelegramUserId(message);
  if (!isAllowedTelegramUser(telegramUserId)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (message.text) {
    const botToken = getRequiredBotToken();
    const { handleTelegramTextMessage, sendTelegramMessage } = await getRouteDependencies();
    const botResponse = await handleTelegramTextMessage({
      text: message.text,
      telegramUserId,
      createDraftFromText: async (text) =>
        postToParseMessage(request, {
          text,
          source: "telegram_text"
        })
    });

    await sendTelegramMessage({
      fetcher: fetch,
      botToken,
      chatId: message.chat.id,
      text: botResponse.text,
      buttons: botResponse.buttons
    });

    return NextResponse.json({ ok: true, handled: "text" });
  }

  if (message.voice) {
    const botToken = getRequiredBotToken();
    const {
      buildTelegramDraftConfirmation,
      downloadTelegramVoiceFile,
      getOpenAiClient,
      sendTelegramMessage,
      transcribeAudioFile
    } = await getRouteDependencies();
    const voiceFile = await downloadTelegramVoiceFile({
      fetcher: fetch,
      botToken,
      fileId: message.voice.file_id
    });
    const transcript = await transcribeAudioFile(getOpenAiClient() as unknown as OpenAiTranscriptionClient, {
      file: voiceFile,
      model: process.env.OPENAI_TRANSCRIBE_MODEL ?? DEFAULT_TRANSCRIBE_MODEL,
      language: "ru"
    });
    const draft = await postToParseMessage(request, {
      text: transcript,
      transcript,
      source: "telegram_voice"
    });
    const botResponse = buildTelegramDraftConfirmation(draft);

    await sendTelegramMessage({
      fetcher: fetch,
      botToken,
      chatId: message.chat.id,
      text: botResponse.text,
      buttons: botResponse.buttons
    });

    return NextResponse.json({ ok: true, handled: "voice", telegramUserId });
  }

  return NextResponse.json({ ok: true, ignored: true });
}
