import { describe, expect, it, vi } from "vitest";
import { parseDraftCallbackData, processTelegramUpdate } from "@/server/telegram/update";

const createDependencies = () => ({
  fetcher: vi.fn(),
  botToken: "token",
  allowedUserId: "123",
  parseMessage: vi.fn(),
  confirmDraft: vi.fn(),
  rejectDraft: vi.fn(),
  sendTelegramMessage: vi.fn(),
  answerTelegramCallbackQuery: vi.fn(),
  downloadTelegramVoiceFile: vi.fn(),
  transcribeAudioFile: vi.fn(),
  getOpenAiClient: vi.fn()
});

describe("parseDraftCallbackData", () => {
  it("extracts draft id and action from Telegram callback data", () => {
    expect(parseDraftCallbackData("draft:draft-1:confirm")).toEqual({
      draftId: "draft-1",
      action: "confirm"
    });
  });

  it("returns null for unknown callback data", () => {
    expect(parseDraftCallbackData("noop")).toBeNull();
  });
});

describe("processTelegramUpdate", () => {
  it("confirms a draft from an inline callback button and replies in Telegram", async () => {
    const dependencies = createDependencies();
    dependencies.confirmDraft.mockResolvedValue({
      ok: true,
      status: 200,
      body: { draftId: "draft-1", applied: 1 }
    });

    const result = await processTelegramUpdate({
      ...dependencies,
      update: {
        callback_query: {
          id: "callback-1",
          from: { id: 123 },
          message: { chat: { id: 456 } },
          data: "draft:draft-1:confirm"
        }
      }
    });

    expect(dependencies.confirmDraft).toHaveBeenCalledWith("draft-1");
    expect(dependencies.rejectDraft).not.toHaveBeenCalled();
    expect(dependencies.answerTelegramCallbackQuery).toHaveBeenCalledWith({
      fetcher: dependencies.fetcher,
      botToken: "token",
      callbackQueryId: "callback-1",
      text: "Сохранено"
    });
    expect(dependencies.sendTelegramMessage).toHaveBeenCalledWith({
      fetcher: dependencies.fetcher,
      botToken: "token",
      chatId: 456,
      text: "Сохранено. Черновик применен к финансам.",
      buttons: []
    });
    expect(result).toEqual({
      ok: true,
      handled: "callback",
      callbackAction: "confirm",
      draftId: "draft-1"
    });
  });

  it("rejects a draft from an inline callback button", async () => {
    const dependencies = createDependencies();
    dependencies.rejectDraft.mockResolvedValue({
      ok: true,
      status: 200,
      body: { id: "draft-2", status: "rejected" }
    });

    const result = await processTelegramUpdate({
      ...dependencies,
      update: {
        callback_query: {
          id: "callback-2",
          from: { id: 123 },
          message: { chat: { id: 456 } },
          data: "draft:draft-2:reject"
        }
      }
    });

    expect(dependencies.rejectDraft).toHaveBeenCalledWith("draft-2");
    expect(dependencies.confirmDraft).not.toHaveBeenCalled();
    expect(dependencies.answerTelegramCallbackQuery).toHaveBeenCalledWith({
      fetcher: dependencies.fetcher,
      botToken: "token",
      callbackQueryId: "callback-2",
      text: "Отменено"
    });
    expect(dependencies.sendTelegramMessage).toHaveBeenCalledWith({
      fetcher: dependencies.fetcher,
      botToken: "token",
      chatId: 456,
      text: "Ок, черновик отменен.",
      buttons: []
    });
    expect(result).toEqual({
      ok: true,
      handled: "callback",
      callbackAction: "reject",
      draftId: "draft-2"
    });
  });

  it("ignores updates from non-allowed Telegram users", async () => {
    const dependencies = createDependencies();

    const result = await processTelegramUpdate({
      ...dependencies,
      update: {
        message: {
          chat: { id: 456 },
          from: { id: 999 },
          text: "Геворг должен 50000"
        }
      }
    });

    expect(result).toEqual({ ok: true, ignored: true });
    expect(dependencies.parseMessage).not.toHaveBeenCalled();
    expect(dependencies.sendTelegramMessage).not.toHaveBeenCalled();
  });
}
);
