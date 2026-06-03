import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/telegram/webhook/route";

const mocks = vi.hoisted(() => {
  const sendTelegramMessage = vi.fn();
  const downloadTelegramVoiceFile = vi.fn();
  const transcribeAudioFile = vi.fn();
  const getOpenAiClient = vi.fn();
  const openAiClient = { name: "openai-client" };

  return {
    sendTelegramMessage,
    downloadTelegramVoiceFile,
    transcribeAudioFile,
    getOpenAiClient,
    openAiClient
  };
});

vi.mock("@/server/telegram/client", () => ({
  sendTelegramMessage: mocks.sendTelegramMessage
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

describe("telegram webhook route", () => {
  const originalBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const originalAllowedUserId = process.env.TELEGRAM_ALLOWED_USER_ID;
  const originalTranscribeModel = process.env.OPENAI_TRANSCRIBE_MODEL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TELEGRAM_BOT_TOKEN = "token";
    process.env.TELEGRAM_ALLOWED_USER_ID = "123";
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
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
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue(draft)
    });
    vi.stubGlobal("fetch", fetcher);

    const response = await POST(
      new Request("http://localhost/api/telegram/webhook", {
        method: "POST",
        body: JSON.stringify({
          message: {
            chat: { id: 456 },
            from: { id: 123 },
            text: "Геворг должен 50000"
          }
        })
      })
    );

    const [parseUrl, parseInit] = fetcher.mock.calls[0];
    expect(String(parseUrl)).toBe("http://localhost/api/parse-message");
    expect(parseInit).toEqual({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Геворг должен 50000",
        source: "telegram_text"
      })
    });
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

  it("handles voice messages through Telegram download, transcription, parse-message, and reply", async () => {
    const voiceFile = new File(["voice"], "telegram-voice.ogg", { type: "audio/ogg" });
    const draft = {
      id: "draft-voice",
      parsedActions: { summary: "Зафиксировать оплату долга." }
    };
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue(draft)
    });
    vi.stubGlobal("fetch", fetcher);
    process.env.OPENAI_TRANSCRIBE_MODEL = "voice-model";
    mocks.downloadTelegramVoiceFile.mockResolvedValue(voiceFile);
    mocks.transcribeAudioFile.mockResolvedValue("Геворг вернул 10000 рублей");

    const response = await POST(
      new Request("http://localhost/api/telegram/webhook", {
        method: "POST",
        body: JSON.stringify({
          message: {
            chat: { id: 456 },
            from: { id: 123 },
            voice: { file_id: "voice-file-id" }
          }
        })
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
    const [parseUrl, parseInit] = fetcher.mock.calls[0];
    expect(String(parseUrl)).toBe("http://localhost/api/parse-message");
    expect(parseInit).toEqual({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Геворг вернул 10000 рублей",
        transcript: "Геворг вернул 10000 рублей",
        source: "telegram_voice"
      })
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

  it("returns callback boundary data without applying draft actions", async () => {
    const response = await POST(
      new Request("http://localhost/api/telegram/webhook", {
        method: "POST",
        body: JSON.stringify({
          callback_query: {
            data: "draft:draft-1:confirm"
          }
        })
      })
    );

    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      ok: true,
      handled: "callback",
      callbackData: "draft:draft-1:confirm"
    });
  });

  it("ignores unknown updates", async () => {
    const response = await POST(
      new Request("http://localhost/api/telegram/webhook", {
        method: "POST",
        body: JSON.stringify({ update_id: 1 })
      })
    );

    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ ok: true, ignored: true });
  });

  it("ignores messages from non-allowed Telegram users", async () => {
    const response = await POST(
      new Request("http://localhost/api/telegram/webhook", {
        method: "POST",
        body: JSON.stringify({
          message: {
            chat: { id: 456 },
            from: { id: 999 },
            text: "Геворг должен 50000"
          }
        })
      })
    );

    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ ok: true, ignored: true });
  });
});
