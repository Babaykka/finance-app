import { z } from "zod";
import type { AiParseResult } from "@/server/ai/schema";
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

type DirectDraftInput = ParseMessageInput & {
  parseResult: AiParseResult;
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

type ConversationState =
  | {
      kind: "awaiting_storage_rename_name";
      payload: Record<string, unknown>;
    }
  | {
      kind: "awaiting_draft_correction";
      payload: Record<string, unknown>;
    };

type ProcessTelegramUpdateInput = {
  update: unknown;
  fetcher: Fetcher;
  botToken: string;
  allowedUserId?: string;
  transcribeModel?: string;
  parseMessage: (body: ParseMessageInput) => Promise<DraftResult>;
  createDraftFromParseResult: (body: DirectDraftInput) => Promise<DraftResult>;
  correctDraft: (body: ParseMessageInput & { draftId: string }) => Promise<DraftResult>;
  answerMessage: (body: AnswerMessageInput) => Promise<AnswerMessageResult>;
  confirmDraft: (draftId: string) => Promise<DraftMutationResult>;
  rejectDraft: (draftId: string) => Promise<DraftMutationResult>;
  getConversationState: (telegramUserId: string) => Promise<ConversationState | null>;
  setConversationState: (input: {
    telegramUserId: string;
    kind: ConversationState["kind"];
    payload: Record<string, unknown>;
  }) => Promise<unknown>;
  clearConversationState: (telegramUserId: string) => Promise<unknown>;
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

const stripTelegramText = (text: string) =>
  text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[?.!]+$/u, "")
    .trim();

const cleanStorageName = (value: string) =>
  stripTelegramText(value)
    .replace(/^["'«]+/u, "")
    .replace(/["'»]+$/u, "")
    .trim();

const getPayloadString = (payload: Record<string, unknown>, key: string) => {
  const value = payload[key];

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
};

type StorageRenameIntent = {
  currentName: string;
  newName: string;
};

const parseCompleteStorageRenameIntent = (text: string): StorageRenameIntent | null => {
  const cleaned = stripTelegramText(text);
  const patterns = [
    /^(?:можешь\s+)?(?:переименуй|переименовать|поменяй\s+название|измени\s+название|назови)\s+(.+?)\s+(?:в|на)\s+(.+)$/iu,
    /^название\s+(.+?)\s+(?:можешь\s+)?(?:поменять|изменить)\s+(?:в|на)\s+(.+)$/iu,
    /^(.+?)\s+(?:можешь\s+)?(?:переименовать|поменять\s+название|изменить\s+название)\s+(?:в|на)\s+(.+)$/iu
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (!match?.[1] || !match[2]) {
      continue;
    }

    const currentName = cleanStorageName(match[1]);
    const newName = cleanStorageName(match[2]);
    if (currentName && newName) {
      return { currentName, newName };
    }
  }

  return null;
};

const parseIncompleteStorageRenameIntent = (text: string) => {
  const cleaned = stripTelegramText(text);
  const patterns = [
    /^(?:можешь\s+)?(?:переименуй|переименовать|поменяй\s+название|измени\s+название)\s+(.+)$/iu,
    /^название\s+(.+?)\s+(?:можешь\s+)?(?:поменять|изменить)$/iu,
    /^(.+?)\s+(?:можешь\s+)?(?:переименовать|поменять\s+название|изменить\s+название)$/iu
  ];

  if (parseCompleteStorageRenameIntent(cleaned)) {
    return null;
  }

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const currentName = cleanStorageName(match[1]);
    if (currentName) {
      return { currentName };
    }
  }

  return null;
};

const buildStorageRenameParseResult = (
  currentName: string,
  newName: string
): AiParseResult => ({
  confidence: 0.98,
  summary: `Переименовать ${currentName} в ${newName}.`,
  actions: [
    {
      type: "update_storage_place",
      currentName,
      name: newName
    }
  ],
  needsClarification: []
});

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
  "добав",
  "учти",
  "запиши",
  "зафикс",
  "обнов",
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
  "втб",
  "сбер",
  "тбанк",
  "альфа",
  "bybit",
  "metamask",
  "usdt",
  "руб"
];

const hasAmountLikeValue = (text: string) =>
  /(?:^|[\s,.;:!?])\d[\d\s.,]*(?:[kк]|тыс|руб|р|₽|usdt|usd|amd|драм|btc|eth|%)?(?:$|[\s,.;:!?%])/u.test(
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

const hasStorageRenameIntent = (text: string) =>
  /(?:переимен|поменяй\s+назван|измени\s+назван|назови)\S*/u.test(text) &&
  /\s+(?:в|на)\s+/u.test(text);

const shouldCreateDraftFromText = (text: string) => {
  const normalized = normalizeIntentText(text);

  if (hasStorageRenameIntent(normalized)) {
    return true;
  }

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

async function sendDraftConfirmation(
  input: ProcessTelegramUpdateInput,
  message: TelegramMessage,
  draft: DraftResult
) {
  const response = buildTelegramDraftConfirmation(draft);

  await input.sendTelegramMessage({
    fetcher: input.fetcher,
    botToken: input.botToken,
    ...messageTarget(message),
    text: response.text,
    buttons: response.buttons
  });
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
  const telegramUserId = String(message.from.id);
  const conversationState = await input.getConversationState(telegramUserId);

  if (conversationState?.kind === "awaiting_storage_rename_name") {
    const currentName = getPayloadString(conversationState.payload, "currentName");
    const newName = cleanStorageName(content.text);

    if (currentName && newName) {
      const draft = await input.createDraftFromParseResult({
        ...content,
        parseResult: buildStorageRenameParseResult(currentName, newName)
      });

      await input.clearConversationState(telegramUserId);
      await sendDraftConfirmation(input, message, draft);

      return { ok: true, handled: "text" as const };
    }

    await input.clearConversationState(telegramUserId);
  }

  if (conversationState?.kind === "awaiting_draft_correction") {
    const draftId = getPayloadString(conversationState.payload, "draftId");

    if (!draftId) {
      await input.clearConversationState(telegramUserId);
    } else {
      const draft = await input.correctDraft({
        draftId,
        text: content.text,
        source: content.source,
        ...(content.transcript ? { transcript: content.transcript } : {})
      });

      await input.clearConversationState(telegramUserId);
      await sendDraftConfirmation(input, message, draft);

      return {
        ok: true,
        handled: content.source === "telegram_voice" ? ("voice" as const) : ("text" as const)
      };
    }
  }

  const directStorageRename = parseCompleteStorageRenameIntent(content.text);
  if (directStorageRename) {
    const draft = await input.createDraftFromParseResult({
      ...content,
      parseResult: buildStorageRenameParseResult(
        directStorageRename.currentName,
        directStorageRename.newName
      )
    });

    await sendDraftConfirmation(input, message, draft);

    return {
      ok: true,
      handled: content.source === "telegram_voice" ? ("voice" as const) : ("text" as const)
    };
  }

  const incompleteStorageRename = parseIncompleteStorageRenameIntent(content.text);
  if (incompleteStorageRename) {
    await input.setConversationState({
      telegramUserId,
      kind: "awaiting_storage_rename_name",
      payload: {
        currentName: incompleteStorageRename.currentName
      }
    });

    await input.sendTelegramMessage({
      fetcher: input.fetcher,
      botToken: input.botToken,
      ...messageTarget(message),
      text: `Как назвать «${incompleteStorageRename.currentName}»?`,
      buttons: []
    });

    return { ok: true, handled: "awaiting_storage_rename_name" as const };
  }

  if (!shouldCreateDraftFromText(content.text)) {
    const answer = await input.answerMessage({
      text: content.text,
      telegramUserId,
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
  await sendDraftConfirmation(input, message, draft);

  return {
    ok: true,
    handled: content.source === "telegram_voice" ? ("voice" as const) : ("text" as const)
  };
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
    await input.setConversationState({
      telegramUserId: String(callback.from.id),
      kind: "awaiting_draft_correction",
      payload: { draftId: callbackData.draftId }
    });

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
        text: "Напиши исправление следующим сообщением. Можно коротко: «сумма 100000», «это не долг, а мои деньги у человека», или полную новую формулировку.",
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
