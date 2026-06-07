import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/telegram/webhook/route";

const mocks = vi.hoisted(() => {
  const sendTelegramMessage = vi.fn();
  const answerTelegramCallbackQuery = vi.fn();
  const createDraftFromParsedMessage = vi.fn();
  const createDraftFromParseResult = vi.fn();
  const createDraftFromCorrectedMessage = vi.fn();
  const answerTelegramAssistantMessage = vi.fn();
  const getTelegramConversationState = vi.fn();
  const setTelegramConversationState = vi.fn();
  const clearTelegramConversationState = vi.fn();
  const downloadTelegramVoiceFile = vi.fn();
  const transcribeAudioFile = vi.fn();
  const getOpenAiClient = vi.fn();
  const confirmAiDraftRoute = vi.fn();
  const rejectAiDraftRoute = vi.fn();
  const openAiClient = { name: "openai-client" };
  const prisma = { name: "prisma" };

  return {
    sendTelegramMessage,
    answerTelegramCallbackQuery,
    createDraftFromParsedMessage,
    createDraftFromParseResult,
    createDraftFromCorrectedMessage,
    answerTelegramAssistantMessage,
    getTelegramConversationState,
    setTelegramConversationState,
    clearTelegramConversationState,
    downloadTelegramVoiceFile,
    transcribeAudioFile,
    getOpenAiClient,
    confirmAiDraftRoute,
    rejectAiDraftRoute,
    openAiClient,
    prisma
  };
});

vi.mock("@/server/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/server/telegram/client", () => ({
  answerTelegramCallbackQuery: mocks.answerTelegramCallbackQuery,
  sendTelegramMessage: mocks.sendTelegramMessage
}));

vi.mock("@/server/services/parse-message-service", () => ({
  createDraftFromParsedMessage: mocks.createDraftFromParsedMessage,
  createDraftFromParseResult: mocks.createDraftFromParseResult
}));

vi.mock("@/server/services/draft-correction-service", () => ({
  createDraftFromCorrectedMessage: mocks.createDraftFromCorrectedMessage
}));

vi.mock("@/server/services/telegram-conversation-state-service", () => ({
  clearTelegramConversationState: mocks.clearTelegramConversationState,
  getTelegramConversationState: mocks.getTelegramConversationState,
  setTelegramConversationState: mocks.setTelegramConversationState
}));

vi.mock("@/server/services/assistant-message-service", () => ({
  answerTelegramAssistantMessage: mocks.answerTelegramAssistantMessage
}));

vi.mock("@/server/telegram/voice", () => ({
  downloadTelegramVoiceFile: mocks.downloadTelegramVoiceFile
}));

vi.mock("@/server/ai/transcription", () => ({
  transcribeAudioFile: mocks.transcribeAudioFile
}));

vi.mock("@/server/ai/openai-adapter", () => ({
  getOpenAiClient: mocks.getOpenAiClient
}));

vi.mock("@/app/api/ai-drafts/[id]/confirm/route", () => ({
  POST: mocks.confirmAiDraftRoute
}));

vi.mock("@/app/api/ai-drafts/[id]/reject/route", () => ({
  POST: mocks.rejectAiDraftRoute
}));

const telegramWebhookRequest = (body: unknown, secret = "secret") =>
  new Request("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers: { "X-Telegram-Bot-Api-Secret-Token": secret },
    body: JSON.stringify(body)
  });

const expectNoDownstreamCalls = (fetcher: ReturnType<typeof vi.fn>) => {
  expect(fetcher).not.toHaveBeenCalled();
  expect(mocks.sendTelegramMessage).not.toHaveBeenCalled();
  expect(mocks.answerTelegramCallbackQuery).not.toHaveBeenCalled();
  expect(mocks.createDraftFromParsedMessage).not.toHaveBeenCalled();
  expect(mocks.createDraftFromParseResult).not.toHaveBeenCalled();
  expect(mocks.createDraftFromCorrectedMessage).not.toHaveBeenCalled();
  expect(mocks.answerTelegramAssistantMessage).not.toHaveBeenCalled();
  expect(mocks.downloadTelegramVoiceFile).not.toHaveBeenCalled();
  expect(mocks.getOpenAiClient).not.toHaveBeenCalled();
  expect(mocks.transcribeAudioFile).not.toHaveBeenCalled();
};

describe("telegram webhook route", () => {
  const originalBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const originalAllowedUserId = process.env.TELEGRAM_ALLOWED_USER_ID;
  const originalTranscribeModel = process.env.OPENAI_TRANSCRIBE_MODEL;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.TELEGRAM_BOT_TOKEN = "token";
    process.env.TELEGRAM_ALLOWED_USER_ID = "123";
    process.env.TELEGRAM_WEBHOOK_SECRET = "secret";
    delete process.env.OPENAI_TRANSCRIBE_MODEL;
    mocks.getOpenAiClient.mockReturnValue(mocks.openAiClient);
  });

  afterEach(() => {
    vi.unstubAllGlobals();

    if (originalBotToken === undefined) {
      delete process.env.TELEGRAM_BOT_TOKEN;
    } else {
      process.env.TELEGRAM_BOT_TOKEN = originalBotToken;
    }

    if (originalWebhookSecret === undefined) {
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
    } else {
      process.env.TELEGRAM_WEBHOOK_SECRET = originalWebhookSecret;
    }

    if (originalAllowedUserId === undefined) {
      delete process.env.TELEGRAM_ALLOWED_USER_ID;
    } else {
      process.env.TELEGRAM_ALLOWED_USER_ID = originalAllowedUserId;
    }

    if (originalTranscribeModel === undefined) {
      delete process.env.OPENAI_TRANSCRIBE_MODEL;
    } else {
      process.env.OPENAI_TRANSCRIBE_MODEL = originalTranscribeModel;
    }
  });

  it("handles text messages through parse-message and sends Telegram buttons", async () => {
    const draft = {
      id: "draft-1",
      parsedActions: { summary: "Создать долг Геворга на 50 000 RUB." }
    };
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    mocks.createDraftFromParsedMessage.mockResolvedValue(draft);

    const response = await POST(
      telegramWebhookRequest({
        message: {
          chat: { id: 456 },
          from: { id: 123 },
          text: "Геворг должен 50000"
        }
      })
    );

    expect(mocks.createDraftFromParsedMessage).toHaveBeenCalledWith({
      text: "Геворг должен 50000",
      source: "telegram_text"
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(mocks.sendTelegramMessage).toHaveBeenCalledWith({
      fetcher,
      botToken: "token",
      chatId: 456,
      text: "Черновик: Создать долг Геворга на 50 000 RUB.",
      buttons: [
        { text: "Сохранить", callbackData: "draft:draft-1:confirm" },
        { text: "Исправить", callbackData: "draft:draft-1:edit" },
        { text: "Отмена", callbackData: "draft:draft-1:reject" }
      ]
    });
    await expect(response.json()).resolves.toEqual({ ok: true, handled: "text" });
  });

  it("handles direct storage rename commands without calling the AI parser", async () => {
    const draft = {
      id: "draft-rename",
      parsedActions: { summary: "Переименовать Нал cash в Наличные в кошельке." }
    };
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    mocks.createDraftFromParseResult.mockResolvedValue(draft);

    const response = await POST(
      telegramWebhookRequest({
        message: {
          chat: { id: 456 },
          from: { id: 123 },
          text: "переименуй Нал cash в Наличные в кошельке"
        }
      })
    );

    expect(mocks.createDraftFromParsedMessage).not.toHaveBeenCalled();
    expect(mocks.createDraftFromParseResult).toHaveBeenCalledWith({
      text: "переименуй Нал cash в Наличные в кошельке",
      source: "telegram_text",
      parseResult: {
        confidence: 0.98,
        summary: "Переименовать Нал cash в Наличные в кошельке.",
        actions: [
          {
            type: "update_storage_place",
            currentName: "Нал cash",
            name: "Наличные в кошельке"
          }
        ],
        needsClarification: []
      }
    });
    expect(mocks.sendTelegramMessage).toHaveBeenCalledWith({
      fetcher,
      botToken: "token",
      chatId: 456,
      text: "Черновик: Переименовать Нал cash в Наличные в кошельке.",
      buttons: [
        { text: "Сохранить", callbackData: "draft:draft-rename:confirm" },
        { text: "Исправить", callbackData: "draft:draft-rename:edit" },
        { text: "Отмена", callbackData: "draft:draft-rename:reject" }
      ]
    });
    await expect(response.json()).resolves.toEqual({ ok: true, handled: "text" });
  });

  it("sends a visible Telegram fallback when text processing fails before any reply", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    mocks.createDraftFromParsedMessage.mockRejectedValue(new Error("parse failed"));

    const response = await POST(
      telegramWebhookRequest({
        message: {
          chat: { id: 456, type: "private" },
          from: { id: 123 },
          message_thread_id: 1620865,
          text: "Геворг должен 50000"
        }
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.sendTelegramMessage).toHaveBeenCalledWith({
      fetcher,
      botToken: "token",
      chatId: 456,
      text: "Не получилось обработать сообщение. Я уже вижу сбой, попробуй отправить еще раз или чуть проще.",
      buttons: []
    });
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Telegram update processing failed"
    });
  });

  it("sends a visible fallback when a draft correction fails", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    mocks.getTelegramConversationState.mockResolvedValue({
      kind: "awaiting_draft_correction",
      payload: { draftId: "draft-old" }
    });
    mocks.createDraftFromCorrectedMessage.mockRejectedValue(new Error("correction failed"));

    const response = await POST(
      telegramWebhookRequest({
        message: {
          chat: { id: 456, type: "private" },
          from: { id: 123 },
          text: "сумма 100000"
        }
      })
    );

    expect(mocks.createDraftFromCorrectedMessage).toHaveBeenCalledWith({
      draftId: "draft-old",
      text: "сумма 100000",
      source: "telegram_text"
    });
    expect(mocks.sendTelegramMessage).toHaveBeenCalledWith({
      fetcher,
      botToken: "token",
      chatId: 456,
      text: "Не получилось обработать сообщение. Я уже вижу сбой, попробуй отправить еще раз или чуть проще.",
      buttons: []
    });
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Telegram update processing failed"
    });
  });

  it("answers callback queries and sends a fallback when edit-state storage fails", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    mocks.setTelegramConversationState.mockRejectedValue(new Error("state failed"));

    const response = await POST(
      telegramWebhookRequest({
        callback_query: {
          id: "callback-edit",
          from: { id: 123 },
          message: { chat: { id: 456 } },
          data: "draft:draft-1:edit"
        }
      })
    );

    expect(mocks.answerTelegramCallbackQuery).toHaveBeenCalledWith({
      fetcher,
      botToken: "token",
      callbackQueryId: "callback-edit",
      text: "Не получилось"
    });
    expect(mocks.sendTelegramMessage).toHaveBeenCalledWith({
      fetcher,
      botToken: "token",
      chatId: 456,
      text: "Не получилось обработать кнопку. Попробуй нажать еще раз.",
      buttons: []
    });
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Telegram update processing failed"
    });
  });

  it("does not send the generic fallback after attempting a user-visible reply", async () => {
    const draft = {
      id: "draft-1",
      parsedActions: { summary: "Добавлена информация о 280k руб в ВТБ под 0%." }
    };
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    mocks.createDraftFromParsedMessage.mockResolvedValue(draft);
    mocks.sendTelegramMessage.mockRejectedValueOnce(new Error("sendMessage failed"));

    const response = await POST(
      telegramWebhookRequest({
        message: {
          chat: { id: 456, type: "private" },
          from: { id: 123 },
          text: "можешь добавить что у меня 280к руб в втб под 0%"
        }
      })
    );

    expect(mocks.sendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(mocks.sendTelegramMessage).toHaveBeenCalledWith({
      fetcher,
      botToken: "token",
      chatId: 456,
      text: "Черновик: Добавлена информация о 280k руб в ВТБ под 0%.",
      buttons: [
        { text: "Сохранить", callbackData: "draft:draft-1:confirm" },
        { text: "Исправить", callbackData: "draft:draft-1:edit" },
        { text: "Отмена", callbackData: "draft:draft-1:reject" }
      ]
    });
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Telegram update processing failed"
    });
  });

  it("handles assistant replies without creating drafts", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    mocks.answerTelegramAssistantMessage.mockResolvedValue({
      text: "У тебя сейчас 1 928 187 RUB в местах хранения."
    });

    const response = await POST(
      telegramWebhookRequest({
        message: {
          chat: { id: 456 },
          from: { id: 123 },
          text: "Сколько у меня денег?"
        }
      })
    );

    expect(mocks.createDraftFromParsedMessage).not.toHaveBeenCalled();
    expect(mocks.answerTelegramAssistantMessage).toHaveBeenCalledWith({
      text: "Сколько у меня денег?",
      telegramUserId: "123",
      source: "telegram_text"
    });
    expect(mocks.sendTelegramMessage).toHaveBeenCalledWith({
      fetcher,
      botToken: "token",
      chatId: 456,
      text: "У тебя сейчас 1 928 187 RUB в местах хранения.",
      buttons: []
    });
    await expect(response.json()).resolves.toEqual({ ok: true, handled: "assistant_reply" });
  });

  it("handles voice messages through Telegram download, transcription, parse-message, and reply", async () => {
    const voiceFile = new File(["voice"], "telegram-voice.ogg", { type: "audio/ogg" });
    const draft = {
      id: "draft-voice",
      parsedActions: { summary: "Зафиксировать оплату долга." }
    };
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    process.env.OPENAI_TRANSCRIBE_MODEL = "voice-model";
    mocks.createDraftFromParsedMessage.mockResolvedValue(draft);
    mocks.downloadTelegramVoiceFile.mockResolvedValue(voiceFile);
    mocks.transcribeAudioFile.mockResolvedValue("Геворг вернул 10000 рублей");

    const response = await POST(
      telegramWebhookRequest({
        message: {
          chat: { id: 456 },
          from: { id: 123 },
          voice: { file_id: "voice-file-id" }
        }
      })
    );

    expect(mocks.downloadTelegramVoiceFile).toHaveBeenCalledWith({
      fetcher,
      botToken: "token",
      fileId: "voice-file-id"
    });
    expect(mocks.getOpenAiClient).toHaveBeenCalledOnce();
    expect(mocks.transcribeAudioFile).toHaveBeenCalledWith(mocks.openAiClient, {
      file: voiceFile,
      model: "voice-model",
      language: "ru"
    });
    expect(mocks.createDraftFromParsedMessage).toHaveBeenCalledWith({
      text: "Геворг вернул 10000 рублей",
      transcript: "Геворг вернул 10000 рублей",
      source: "telegram_voice"
    });
    expect(mocks.sendTelegramMessage).toHaveBeenCalledWith({
      fetcher,
      botToken: "token",
      chatId: 456,
      text: "Черновик: Зафиксировать оплату долга.",
      buttons: [
        { text: "Сохранить", callbackData: "draft:draft-voice:confirm" },
        { text: "Исправить", callbackData: "draft:draft-voice:edit" },
        { text: "Отмена", callbackData: "draft:draft-voice:reject" }
      ]
    });
    await expect(response.json()).resolves.toEqual({
      ok: true,
      handled: "voice",
      telegramUserId: "123"
    });
  });

  it("confirms drafts from callback buttons", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    mocks.confirmAiDraftRoute.mockResolvedValue(
      Response.json({ draftId: "draft-1", applied: 1 })
    );

    const response = await POST(
      telegramWebhookRequest({
        callback_query: {
          id: "callback-1",
          from: { id: 123 },
          message: { chat: { id: 456 } },
          data: "draft:draft-1:confirm"
        }
      })
    );

    expect(fetcher).not.toHaveBeenCalled();
    expect(mocks.confirmAiDraftRoute).toHaveBeenCalledWith(expect.any(Request), {
      params: expect.any(Promise)
    });
    await expect(mocks.confirmAiDraftRoute.mock.calls[0]?.[1].params).resolves.toEqual({
      id: "draft-1"
    });
    expect(mocks.answerTelegramCallbackQuery).toHaveBeenCalledWith({
      fetcher,
      botToken: "token",
      callbackQueryId: "callback-1",
      text: "Сохранено"
    });
    expect(mocks.sendTelegramMessage).toHaveBeenCalledWith({
      fetcher,
      botToken: "token",
      chatId: 456,
      text: "Сохранено. Черновик применен к финансам.",
      buttons: []
    });
    await expect(response.json()).resolves.toEqual({
      ok: true,
      handled: "callback",
      callbackAction: "confirm",
      draftId: "draft-1"
    });
  });

  it("ignores unknown updates", async () => {
    const response = await POST(telegramWebhookRequest({ update_id: 1 }));

    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ ok: true, ignored: true });
  });

  it("ignores messages from non-allowed Telegram users", async () => {
    const response = await POST(
      telegramWebhookRequest({
        message: {
          chat: { id: 456 },
          from: { id: 999 },
          text: "Геворг должен 50000"
        }
      })
    );

    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ ok: true, ignored: true });
  });

  it("fails closed when webhook secret is not configured", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "";
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    const response = await POST(
      telegramWebhookRequest({
        message: {
          chat: { id: 456 },
          from: { id: 123 },
          text: "Геворг должен 50000"
        }
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "TELEGRAM_WEBHOOK_SECRET is required"
    });
    expectNoDownstreamCalls(fetcher);
  });

  it("rejects webhook secret mismatches before downstream processing", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    const response = await POST(
      telegramWebhookRequest(
        {
          message: {
            chat: { id: 456 },
            from: { id: 123 },
            voice: { file_id: "voice-file-id" }
          }
        },
        "wrong-secret"
      )
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Telegram webhook secret mismatch"
    });
    expectNoDownstreamCalls(fetcher);
  });

  it("returns 400 for malformed json before downstream processing", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    const response = await POST(
      new Request("http://localhost/api/telegram/webhook", {
        method: "POST",
        headers: { "X-Telegram-Bot-Api-Secret-Token": "secret" },
        body: "not json"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid Telegram webhook payload"
    });
    expectNoDownstreamCalls(fetcher);
  });

  it("returns 400 for schema-invalid payloads before downstream processing", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    const response = await POST(
      telegramWebhookRequest({
        message: {
          chat: { id: "456" },
          from: { id: 123 },
          text: "Геворг должен 50000"
        }
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid Telegram webhook payload"
    });
    expectNoDownstreamCalls(fetcher);
  });
});
