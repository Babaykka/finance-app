import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/telegram/webhook/route";

const mocks = vi.hoisted(() => {
  const sendTelegramMessage = vi.fn();
  const answerTelegramCallbackQuery = vi.fn();
  const createDraftFromParsedMessage = vi.fn();
  const downloadTelegramVoiceFile = vi.fn();
  const transcribeAudioFile = vi.fn();
  const getOpenAiClient = vi.fn();
  const openAiClient = { name: "openai-client" };

  return {
    sendTelegramMessage,
    answerTelegramCallbackQuery,
    createDraftFromParsedMessage,
    downloadTelegramVoiceFile,
    transcribeAudioFile,
    getOpenAiClient,
    openAiClient
  };
});

vi.mock("@/server/telegram/client", () => ({
  answerTelegramCallbackQuery: mocks.answerTelegramCallbackQuery,
  sendTelegramMessage: mocks.sendTelegramMessage
}));

vi.mock("@/server/services/parse-message-service", () => ({
  createDraftFromParsedMessage: mocks.createDraftFromParsedMessage
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
    vi.clearAllMocks();
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

  it("notifies the user when text message processing fails", async () => {
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
      text: expect.stringContaining("не смог обработать"),
      buttons: []
    });
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Telegram update processing failed"
    });
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
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ draftId: "draft-1", applied: 1 })
    });
    vi.stubGlobal("fetch", fetcher);

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

    expect(fetcher).toHaveBeenCalledWith("http://localhost/api/ai-drafts/draft-1/confirm", {
      method: "POST",
      headers: { "X-Finance-Internal-Secret": "secret" }
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
