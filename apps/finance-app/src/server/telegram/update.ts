import { z } from "zod";
import type { OpenAiTranscriptionClient } from "@/server/ai/transcription";

const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";

const TelegramChatSchema = z.object({
  id: z.number(),
  type: z.string().optional()
});

const TelegramUserSchema = z.object({
  id: z.number()
});

const TelegramMessageSchema = z.object({
  chat: TelegramChatSchema,
  from: TelegramUserSchema,
  message_thread_id: z.number().optional(),
  text: z.string().optional(),
  voice: z.object({ file_id: z.string().min(1) }).optional()
});

const TelegramCallbackQuerySchema = z.object({
  id: z.string().min(1),
  from: TelegramUserSchema,
  message: z
    .object({
      chat: TelegramChatSchema,
      message_thread_id: z.number().optional()
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

type AnswerMessageInput = {
  text: string;
  telegramUserId: string;
  source: "telegram_text" | "telegram_voice";
  transcript?: string;
};

type AnswerMessageResult = {
  text: string;
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
  answerMessage: (body: AnswerMessageInput) => Promise<AnswerMessageResult>;
  confirmDraft: (draftId: string) => Promise<DraftMutationResult>;
  rejectDraft: (draftId: string) => Promise<DraftMutationResult>;
  sendTelegramMessage: (input: {
    fetcher: Fetcher;
    botToken: string;
    chatId: number;
    messageThreadId?: number;
    directMessagesTopicId?: number;
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

const HELP_TEXT = [
  "Напиши финансовое событие обычным текстом или голосом.",
  "Например: долг Грно 15000 руб до конца июня, друг.",
  "Я создам черновик, а ты подтвердишь его кнопкой.",
  "Еще можно спрашивать: сколько денег, кто должен, где что лежит.",
  "И можно просто поговорить."
].join("\n");

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

const getCommand = (text: string) => {
  const normalized = text.trim().toLocaleLowerCase("ru-RU");
  const command = normalized.split(/\s+/)[0]?.split("@")[0];

  if (command === "/start") {
    return "start";
  }

  if (command === "/help") {
    return "help";
  }

  return null;
};

const normalizeIntentText = (text: string) =>
  text
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ")
    .trim();

const QUESTION_STARTERS = [
  "кто",
  "сколько",
  "где",
  "что",
  "какой",
  "какая",
  "какие",
  "когда",
  "почему",
  "зачем",
  "как",
  "покажи",
  "расскажи",
  "объясни",
  "посчитай",
  "сравни"
];

const FINANCIAL_ACTION_KEYWORDS = [
  "долг",
  "долж",
  "вернул",
  "вернула",
  "вернули",
  "возврат",
  "оплат",
  "заплат",
  "получил",
  "получила",
  "приход",
  "перевел",
  "перевела",
  "перевод",
  "лежит",
  "лежат",
  "хран",
  "есть",
  "накоп",
  "вклад",
  "карта",
  "счет",
  "счёт",
  "налич",
  "bybit",
  "metamask",
  "usdt",
  "руб"
];

const hasAmountLikeValue = (text: string) =>
  /(?:^|[\s,.;:!?])\d[\d\s.,]*(?:к|тыс|руб|р|₽|usdt|usd|amd|драм|btc|eth)?(?:$|[\s,.;:!?])/u.test(
    text
  );

const hasQuestionIntent = (text: string) => {
  const normalized = normalizeIntentText(text);

  return (
    normalized.includes("?") ||
    QUESTION_STARTERS.some(
      (starter) => normalized === starter || normalized.startsWith(`${starter} `)
    )
  );
};

const shouldCreateDraftFromText = (text: string) => {
  const normalized = normalizeIntentText(text);

  if (hasQuestionIntent(normalized)) {
    return false;
  }

  return (
    hasAmountLikeValue(normalized) &&
    FINANCIAL_ACTION_KEYWORDS.some((keyword) => normalized.includes(keyword))
  );
};

const messageTarget = (message: TelegramMessage) => ({
  chatId: message.chat.id
});

const callbackMessageTarget = (callback: TelegramCallbackQuery) => {
  if (!callback.message) {
    return null;
  }

  return {
    chatId: callback.message.chat.id
  };
};

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
  const command = getCommand(message.text ?? "");
  if (command) {
    await input.sendTelegramMessage({
      fetcher: input.fetcher,
      botToken: input.botToken,
      ...messageTarget(message),
      text: HELP_TEXT,
      buttons: []
    });

    return { ok: true, handled: "command" as const, command };
  }

  return processNaturalLanguageMessage(input, message, {
    text: message.text ?? "",
    source: "telegram_text"
  });
}

async function processNaturalLanguageMessage(
  input: ProcessTelegramUpdateInput,
  message: TelegramMessage,
  content: ParseMessageInput
) {
  if (!shouldCreateDraftFromText(content.text)) {
    const answer = await input.answerMessage({
      text: content.text,
      telegramUserId: String(message.from.id),
      source: content.source,
      ...(content.transcript ? { transcript: content.transcript } : {})
    });

    await input.sendTelegramMessage({
      fetcher: input.fetcher,
      botToken: input.botToken,
      ...messageTarget(message),
      text: answer.text,
      buttons: []
    });

    return { ok: true, handled: "assistant_reply" as const };
  }

  const draft = await input.parseMessage({
    text: content.text,
    source: content.source,
    ...(content.transcript ? { transcript: content.transcript } : {})
  });
  const response = buildTelegramDraftConfirmation(draft);

  await input.sendTelegramMessage({
    fetcher: input.fetcher,
    botToken: input.botToken,
    ...messageTarget(message),
    text: response.text,
    buttons: response.buttons
  });

  return { ok: true, handled: content.source === "telegram_voice" ? ("voice" as const) : ("text" as const) };
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

  const result = await processNaturalLanguageMessage(input, message, {
    text: transcript,
    transcript,
    source: "telegram_voice"
  });

  return result.handled === "voice" ? { ...result, telegramUserId: String(message.from.id) } : result;
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

  const target = callbackMessageTarget(callback);
  if (target) {
    await input.sendTelegramMessage({
      fetcher: input.fetcher,
      botToken: input.botToken,
      ...target,
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

    const target = callbackMessageTarget(callback);
    if (target) {
      await input.sendTelegramMessage({
        fetcher: input.fetcher,
        botToken: input.botToken,
        ...target,
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

  const target = callbackMessageTarget(callback);
  if (target) {
    await input.sendTelegramMessage({
      fetcher: input.fetcher,
      botToken: input.botToken,
      ...target,
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
