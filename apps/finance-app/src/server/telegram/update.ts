import { z } from "zod";
import type { OpenAiTranscriptionClient } from "@/server/ai/transcription";

const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";

const TelegramChatSchema = z.object({
  id: z.number()
});

const TelegramUserSchema = z.object({
  id: z.number()
});

const TelegramMessageSchema = z.object({
  chat: TelegramChatSchema,
  from: TelegramUserSchema,
  text: z.string().optional(),
  voice: z.object({ file_id: z.string().min(1) }).optional()
});

const TelegramCallbackQuerySchema = z.object({
  id: z.string().min(1),
  from: TelegramUserSchema,
  message: z
    .object({
      chat: TelegramChatSchema
    })
    .optional(),
  data: z.string().optional()
});

export const TelegramUpdateSchema = z.object({
  update_id: z.number().optional(),
  message: TelegramMessageSchema.optional(),
  callback_query: TelegramCallbackQuerySchema.optional()
});

type Fetcher = typeof fetch;
type TelegramMessage = z.infer<typeof TelegramMessageSchema>;
type TelegramCallbackQuery = z.infer<typeof TelegramCallbackQuerySchema>;

type TelegramInlineButton = {
  text: string;
  callbackData: string;
};

type DraftResult = {
  id: string;
  parsedActions: unknown;
};

type ParseMessageInput = {
  text: string;
  source: "telegram_text" | "telegram_voice";
  transcript?: string;
};

type DraftMutationResult = {
  ok: boolean;
  status: number;
  body?: unknown;
};

type ProcessTelegramUpdateInput = {
  update: unknown;
  fetcher: Fetcher;
  botToken: string;
  allowedUserId?: string;
  transcribeModel?: string;
  parseMessage: (body: ParseMessageInput) => Promise<DraftResult>;
  confirmDraft: (draftId: string) => Promise<DraftMutationResult>;
  rejectDraft: (draftId: string) => Promise<DraftMutationResult>;
  sendTelegramMessage: (input: {
    fetcher: Fetcher;
    botToken: string;
    chatId: number;
    text: string;
    buttons: TelegramInlineButton[];
  }) => Promise<void>;
  answerTelegramCallbackQuery: (input: {
    fetcher: Fetcher;
    botToken: string;
    callbackQueryId: string;
    text: string;
  }) => Promise<void>;
  downloadTelegramVoiceFile: (input: {
    fetcher: Fetcher;
    botToken: string;
    fileId: string;
  }) => Promise<File>;
  transcribeAudioFile: (
    client: OpenAiTranscriptionClient,
    input: { file: File; model: string; language?: string }
  ) => Promise<string>;
  getOpenAiClient: () => OpenAiTranscriptionClient;
};

const CALLBACK_ACTIONS = ["confirm", "edit", "reject"] as const;
type DraftCallbackAction = (typeof CALLBACK_ACTIONS)[number];

const isAllowedTelegramUser = (telegramUserId: string, allowedUserId?: string) =>
  !allowedUserId || allowedUserId === telegramUserId;

const buildDraftButtons = (draftId: string): TelegramInlineButton[] => [
  { text: "Сохранить", callbackData: `draft:${draftId}:confirm` },
  { text: "Исправить", callbackData: `draft:${draftId}:edit` },
  { text: "Отмена", callbackData: `draft:${draftId}:reject` }
];

const getDraftSummary = (parsedActions: unknown) => {
  if (
    typeof parsedActions === "object" &&
    parsedActions !== null &&
    "summary" in parsedActions &&
    typeof parsedActions.summary === "string" &&
    parsedActions.summary.trim().length > 0
  ) {
    return parsedActions.summary;
  }

  return "проверь действие перед сохранением";
};

function buildTelegramDraftConfirmation(draft: DraftResult) {
  return {
    text: `Черновик: ${getDraftSummary(draft.parsedActions)}`,
    buttons: buildDraftButtons(draft.id)
  };
}

export function parseDraftCallbackData(value: string | undefined) {
  if (!value) {
    return null;
  }

  const [prefix, draftId, action, ...rest] = value.split(":");
  if (
    prefix !== "draft" ||
    !draftId ||
    !CALLBACK_ACTIONS.includes(action as DraftCallbackAction) ||
    rest.length > 0
  ) {
    return null;
  }

  return {
    draftId,
    action: action as DraftCallbackAction
  };
}

async function processTextMessage(input: ProcessTelegramUpdateInput, message: TelegramMessage) {
  const draft = await input.parseMessage({
    text: message.text ?? "",
    source: "telegram_text"
  });
  const response = buildTelegramDraftConfirmation(draft);

  await input.sendTelegramMessage({
    fetcher: input.fetcher,
    botToken: input.botToken,
    chatId: message.chat.id,
    text: response.text,
    buttons: response.buttons
  });

  return { ok: true, handled: "text" as const };
}

async function processVoiceMessage(input: ProcessTelegramUpdateInput, message: TelegramMessage) {
  const voice = message.voice;
  if (!voice) {
    return { ok: true, ignored: true };
  }

  const voiceFile = await input.downloadTelegramVoiceFile({
    fetcher: input.fetcher,
    botToken: input.botToken,
    fileId: voice.file_id
  });
  const transcript = await input.transcribeAudioFile(input.getOpenAiClient(), {
    file: voiceFile,
    model: input.transcribeModel ?? DEFAULT_TRANSCRIBE_MODEL,
    language: "ru"
  });
  const draft = await input.parseMessage({
    text: transcript,
    transcript,
    source: "telegram_voice"
  });
  const response = buildTelegramDraftConfirmation(draft);

  await input.sendTelegramMessage({
    fetcher: input.fetcher,
    botToken: input.botToken,
    chatId: message.chat.id,
    text: response.text,
    buttons: response.buttons
  });

  return { ok: true, handled: "voice" as const, telegramUserId: String(message.from.id) };
}

async function notifyDraftMutationFailure(
  input: ProcessTelegramUpdateInput,
  callback: TelegramCallbackQuery,
  text: string
) {
  await input.answerTelegramCallbackQuery({
    fetcher: input.fetcher,
    botToken: input.botToken,
    callbackQueryId: callback.id,
    text
  });

  if (callback.message) {
    await input.sendTelegramMessage({
      fetcher: input.fetcher,
      botToken: input.botToken,
      chatId: callback.message.chat.id,
      text,
      buttons: []
    });
  }
}

async function processCallbackQuery(
  input: ProcessTelegramUpdateInput,
  callback: TelegramCallbackQuery
) {
  const callbackData = parseDraftCallbackData(callback.data);

  if (!callbackData) {
    await input.answerTelegramCallbackQuery({
      fetcher: input.fetcher,
      botToken: input.botToken,
      callbackQueryId: callback.id,
      text: "Не понял кнопку"
    });

    return { ok: true, ignored: true };
  }

  if (callbackData.action === "edit") {
    await input.answerTelegramCallbackQuery({
      fetcher: input.fetcher,
      botToken: input.botToken,
      callbackQueryId: callback.id,
      text: "Ок"
    });

    if (callback.message) {
      await input.sendTelegramMessage({
        fetcher: input.fetcher,
        botToken: input.botToken,
        chatId: callback.message.chat.id,
        text: "Отправь исправленную формулировку новым сообщением, я создам новый черновик.",
        buttons: []
      });
    }

    return {
      ok: true,
      handled: "callback" as const,
      callbackAction: callbackData.action,
      draftId: callbackData.draftId
    };
  }

  const mutation =
    callbackData.action === "confirm"
      ? await input.confirmDraft(callbackData.draftId)
      : await input.rejectDraft(callbackData.draftId);

  if (!mutation.ok) {
    await notifyDraftMutationFailure(
      input,
      callback,
      mutation.status === 404
        ? "Черновик уже обработан или не найден"
        : "Не получилось обработать черновик"
    );

    return {
      ok: true,
      handled: "callback" as const,
      callbackAction: callbackData.action,
      draftId: callbackData.draftId,
      errorStatus: mutation.status
    };
  }

  const answerText = callbackData.action === "confirm" ? "Сохранено" : "Отменено";
  const messageText =
    callbackData.action === "confirm"
      ? "Сохранено. Черновик применен к финансам."
      : "Ок, черновик отменен.";

  await input.answerTelegramCallbackQuery({
    fetcher: input.fetcher,
    botToken: input.botToken,
    callbackQueryId: callback.id,
    text: answerText
  });

  if (callback.message) {
    await input.sendTelegramMessage({
      fetcher: input.fetcher,
      botToken: input.botToken,
      chatId: callback.message.chat.id,
      text: messageText,
      buttons: []
    });
  }

  return {
    ok: true,
    handled: "callback" as const,
    callbackAction: callbackData.action,
    draftId: callbackData.draftId
  };
}

export async function processTelegramUpdate(input: ProcessTelegramUpdateInput) {
  const update = TelegramUpdateSchema.parse(input.update);

  if (update.callback_query) {
    const telegramUserId = String(update.callback_query.from.id);
    if (!isAllowedTelegramUser(telegramUserId, input.allowedUserId)) {
      return { ok: true, ignored: true };
    }

    return processCallbackQuery(input, update.callback_query);
  }

  if (!update.message) {
    return { ok: true, ignored: true };
  }

  const telegramUserId = String(update.message.from.id);
  if (!isAllowedTelegramUser(telegramUserId, input.allowedUserId)) {
    return { ok: true, ignored: true };
  }

  if (update.message.text) {
    return processTextMessage(input, update.message);
  }

  if (update.message.voice) {
    return processVoiceMessage(input, update.message);
  }

  return { ok: true, ignored: true };
}
