import { describe, expect, it, vi } from "vitest";
import { parseDraftCallbackData, processTelegramUpdate } from "@/server/telegram/update";

const createDependencies = () => ({
  fetcher: vi.fn(),
  botToken: "token",
  allowedUserId: "123",
  parseMessage: vi.fn(),
  createDraftFromParseResult: vi.fn(),
  correctDraft: vi.fn(),
  answerMessage: vi.fn(),
  confirmDraft: vi.fn(),
  rejectDraft: vi.fn(),
  getConversationState: vi.fn(),
  setConversationState: vi.fn(),
  clearConversationState: vi.fn(),
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
  it("keeps text replies in the plain chat even when Telegram sends a topic id", async () => {
    const dependencies = createDependencies();
    dependencies.parseMessage.mockResolvedValue({
      id: "draft-topic",
      parsedActions: { summary: "Создать долг." }
    });

    const result = await processTelegramUpdate({
      ...dependencies,
      update: {
        message: {
          chat: { id: 456 },
          from: { id: 123 },
          message_thread_id: 1620865,
          text: "долг Грно 15000"
        }
      }
    });

    expect(dependencies.sendTelegramMessage).toHaveBeenCalledWith({
      fetcher: dependencies.fetcher,
      botToken: "token",
      chatId: 456,
      text: "Черновик: Создать долг.",
      buttons: [
        { text: "Сохранить", callbackData: "draft:draft-topic:confirm" },
        { text: "Исправить", callbackData: "draft:draft-topic:edit" },
        { text: "Отмена", callbackData: "draft:draft-topic:reject" }
      ]
    });
    expect(result).toEqual({ ok: true, handled: "text" });
  });

  it("does not propagate direct message topic ids for private replies", async () => {
    const dependencies = createDependencies();
    dependencies.parseMessage.mockResolvedValue({
      id: "draft-private-topic",
      parsedActions: { summary: "Создать долг." }
    });

    await processTelegramUpdate({
      ...dependencies,
      update: {
        message: {
          chat: { id: 456, type: "private" },
          from: { id: 123 },
          message_thread_id: 1620865,
          is_topic_message: true,
          text: "долг Грно 15000"
        }
      }
    });

    expect(dependencies.sendTelegramMessage).toHaveBeenCalledWith({
      fetcher: dependencies.fetcher,
      botToken: "token",
      chatId: 456,
      text: "Черновик: Создать долг.",
      buttons: [
        { text: "Сохранить", callbackData: "draft:draft-private-topic:confirm" },
        { text: "Исправить", callbackData: "draft:draft-private-topic:edit" },
        { text: "Отмена", callbackData: "draft:draft-private-topic:reject" }
      ]
    });
  });

  it("answers /start without sending the command to the AI parser", async () => {
    const dependencies = createDependencies();

    const result = await processTelegramUpdate({
      ...dependencies,
      update: {
        message: {
          chat: { id: 456 },
          from: { id: 123 },
          message_thread_id: 1620850,
          text: "/start"
        }
      }
    });

    expect(dependencies.parseMessage).not.toHaveBeenCalled();
    expect(dependencies.answerMessage).not.toHaveBeenCalled();
    expect(dependencies.sendTelegramMessage).toHaveBeenCalledWith({
      fetcher: dependencies.fetcher,
      botToken: "token",
      chatId: 456,
      text: expect.stringContaining("Напиши финансовое событие"),
      buttons: []
    });
    expect(result).toEqual({ ok: true, handled: "command", command: "start" });
  });

  it("answers finance questions without creating a draft", async () => {
    const dependencies = createDependencies();
    dependencies.answerMessage.mockResolvedValue({
      text: "У тебя 1 928 187 RUB в местах хранения и 91 500 RUB к получению."
    });

    const result = await processTelegramUpdate({
      ...dependencies,
      update: {
        message: {
          chat: { id: 456 },
          from: { id: 123 },
          text: "Сколько у меня денег?"
        }
      }
    });

    expect(dependencies.parseMessage).not.toHaveBeenCalled();
    expect(dependencies.answerMessage).toHaveBeenCalledWith({
      text: "Сколько у меня денег?",
      telegramUserId: "123",
      source: "telegram_text"
    });
    expect(dependencies.sendTelegramMessage).toHaveBeenCalledWith({
      fetcher: dependencies.fetcher,
      botToken: "token",
      chatId: 456,
      text: "У тебя 1 928 187 RUB в местах хранения и 91 500 RUB к получению.",
      buttons: []
    });
    expect(result).toEqual({ ok: true, handled: "assistant_reply" });
  });

  it("creates drafts for polite add requests with latin k amounts", async () => {
    const dependencies = createDependencies();
    dependencies.parseMessage.mockResolvedValue({
      id: "draft-add-storage",
      parsedActions: { summary: "Добавить ВТБ 280 000 RUB под 0%." }
    });

    const result = await processTelegramUpdate({
      ...dependencies,
      update: {
        message: {
          chat: { id: 456 },
          from: { id: 123 },
          text: "можешь добавить что у меня 280k руб в втб под 0%"
        }
      }
    });

    expect(dependencies.answerMessage).not.toHaveBeenCalled();
    expect(dependencies.parseMessage).toHaveBeenCalledWith({
      text: "можешь добавить что у меня 280k руб в втб под 0%",
      source: "telegram_text"
    });
    expect(dependencies.sendTelegramMessage).toHaveBeenCalledWith({
      fetcher: dependencies.fetcher,
      botToken: "token",
      chatId: 456,
      text: "Черновик: Добавить ВТБ 280 000 RUB под 0%.",
      buttons: [
        { text: "Сохранить", callbackData: "draft:draft-add-storage:confirm" },
        { text: "Исправить", callbackData: "draft:draft-add-storage:edit" },
        { text: "Отмена", callbackData: "draft:draft-add-storage:reject" }
      ]
    });
    expect(result).toEqual({ ok: true, handled: "text" });
  });

  it("asks for clarification instead of showing save for unclear drafts", async () => {
    const dependencies = createDependencies();
    dependencies.parseMessage.mockResolvedValue({
      id: "draft-needs-clarification",
      parsedActions: {
        summary: "Записать оплату долга.",
        actions: [],
        needsClarification: ["Уточнить, к какому долгу относится оплата."]
      }
    });

    const result = await processTelegramUpdate({
      ...dependencies,
      update: {
        message: {
          chat: { id: 456 },
          from: { id: 123 },
          text: "Вероника оплатила 18000"
        }
      }
    });

    expect(dependencies.sendTelegramMessage).toHaveBeenCalledWith({
      fetcher: dependencies.fetcher,
      botToken: "token",
      chatId: 456,
      text: "Черновик: Записать оплату долга.\n\nНужно уточнить: Уточнить, к какому долгу относится оплата.",
      buttons: [
        { text: "Исправить", callbackData: "draft:draft-needs-clarification:edit" },
        { text: "Отмена", callbackData: "draft:draft-needs-clarification:reject" }
      ]
    });
    expect(result).toEqual({ ok: true, handled: "text" });
  });

  it("creates storage rename drafts directly without calling the AI parser", async () => {
    const dependencies = createDependencies();
    dependencies.createDraftFromParseResult.mockResolvedValue({
      id: "draft-rename-storage",
      parsedActions: {
        summary: "Переименовать Нал cash в Наличные в кошельке."
      }
    });

    const result = await processTelegramUpdate({
      ...dependencies,
      update: {
        message: {
          chat: { id: 456 },
          from: { id: 123 },
          text: "переименуй Нал cash в наличные в кошельке"
        }
      }
    });

    expect(dependencies.answerMessage).not.toHaveBeenCalled();
    expect(dependencies.parseMessage).not.toHaveBeenCalled();
    expect(dependencies.createDraftFromParseResult).toHaveBeenCalledWith({
      text: "переименуй Нал cash в наличные в кошельке",
      source: "telegram_text",
      parseResult: {
        confidence: 0.98,
        summary: "Переименовать Нал cash в наличные в кошельке.",
        actions: [
          {
            type: "update_storage_place",
            currentName: "Нал cash",
            name: "наличные в кошельке"
          }
        ],
        needsClarification: []
      }
    });
    expect(dependencies.sendTelegramMessage).toHaveBeenCalledWith({
      fetcher: dependencies.fetcher,
      botToken: "token",
      chatId: 456,
      text: "Черновик: Переименовать Нал cash в Наличные в кошельке.",
      buttons: [
        { text: "Сохранить", callbackData: "draft:draft-rename-storage:confirm" },
        { text: "Исправить", callbackData: "draft:draft-rename-storage:edit" },
        { text: "Отмена", callbackData: "draft:draft-rename-storage:reject" }
      ]
    });
    expect(result).toEqual({ ok: true, handled: "text" });
  });

  it("asks for the new name when a storage rename request is incomplete", async () => {
    const dependencies = createDependencies();

    const result = await processTelegramUpdate({
      ...dependencies,
      update: {
        message: {
          chat: { id: 456 },
          from: { id: 123 },
          text: "название Нал cash можешь поменять?"
        }
      }
    });

    expect(dependencies.parseMessage).not.toHaveBeenCalled();
    expect(dependencies.answerMessage).not.toHaveBeenCalled();
    expect(dependencies.setConversationState).toHaveBeenCalledWith({
      telegramUserId: "123",
      kind: "awaiting_storage_rename_name",
      payload: {
        currentName: "Нал cash"
      }
    });
    expect(dependencies.sendTelegramMessage).toHaveBeenCalledWith({
      fetcher: dependencies.fetcher,
      botToken: "token",
      chatId: 456,
      text: "Как назвать «Нал cash»?",
      buttons: []
    });
    expect(result).toEqual({ ok: true, handled: "awaiting_storage_rename_name" });
  });

  it("creates a storage rename draft from the next message after an incomplete rename", async () => {
    const dependencies = createDependencies();
    dependencies.getConversationState.mockResolvedValue({
      kind: "awaiting_storage_rename_name",
      payload: {
        currentName: "Нал cash"
      }
    });
    dependencies.createDraftFromParseResult.mockResolvedValue({
      id: "draft-rename-followup",
      parsedActions: {
        summary: "Переименовать Нал cash в Наличные в кошельке."
      }
    });

    const result = await processTelegramUpdate({
      ...dependencies,
      update: {
        message: {
          chat: { id: 456 },
          from: { id: 123 },
          text: "Наличные в кошельке"
        }
      }
    });

    expect(dependencies.parseMessage).not.toHaveBeenCalled();
    expect(dependencies.createDraftFromParseResult).toHaveBeenCalledWith({
      text: "Наличные в кошельке",
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
    expect(dependencies.clearConversationState).toHaveBeenCalledWith("123");
    expect(dependencies.sendTelegramMessage).toHaveBeenCalledWith({
      fetcher: dependencies.fetcher,
      botToken: "token",
      chatId: 456,
      text: "Черновик: Переименовать Нал cash в Наличные в кошельке.",
      buttons: [
        { text: "Сохранить", callbackData: "draft:draft-rename-followup:confirm" },
        { text: "Исправить", callbackData: "draft:draft-rename-followup:edit" },
        { text: "Отмена", callbackData: "draft:draft-rename-followup:reject" }
      ]
    });
    expect(result).toEqual({ ok: true, handled: "text" });
  });

  it("answers casual messages without creating a draft", async () => {
    const dependencies = createDependencies();
    dependencies.answerMessage.mockResolvedValue({
      text: "Я на месте. Можем разобрать финансы или просто поговорить."
    });

    const result = await processTelegramUpdate({
      ...dependencies,
      update: {
        message: {
          chat: { id: 456 },
          from: { id: 123 },
          text: "как дела?"
        }
      }
    });

    expect(dependencies.parseMessage).not.toHaveBeenCalled();
    expect(dependencies.answerMessage).toHaveBeenCalledWith({
      text: "как дела?",
      telegramUserId: "123",
      source: "telegram_text"
    });
    expect(dependencies.sendTelegramMessage).toHaveBeenCalledWith({
      fetcher: dependencies.fetcher,
      botToken: "token",
      chatId: 456,
      text: "Я на месте. Можем разобрать финансы или просто поговорить.",
      buttons: []
    });
    expect(result).toEqual({ ok: true, handled: "assistant_reply" });
  });

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

  it("sends the route validation message when a draft cannot be confirmed", async () => {
    const dependencies = createDependencies();
    dependencies.confirmDraft.mockResolvedValue({
      ok: false,
      status: 422,
      body: {
        message:
          "Этот черновик сначала нужно уточнить. Нажми «Исправить» и напиши недостающие данные."
      }
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
    expect(dependencies.sendTelegramMessage).toHaveBeenCalledWith({
      fetcher: dependencies.fetcher,
      botToken: "token",
      chatId: 456,
      text: "Этот черновик сначала нужно уточнить. Нажми «Исправить» и напиши недостающие данные.",
      buttons: []
    });
    expect(result).toEqual({
      ok: true,
      handled: "callback",
      callbackAction: "confirm",
      draftId: "draft-1",
      errorStatus: 422
    });
  });

  it("stores edit state when the user taps the edit draft button", async () => {
    const dependencies = createDependencies();

    const result = await processTelegramUpdate({
      ...dependencies,
      update: {
        callback_query: {
          id: "callback-edit",
          from: { id: 123 },
          message: { chat: { id: 456 } },
          data: "draft:draft-1:edit"
        }
      }
    });

    expect(dependencies.setConversationState).toHaveBeenCalledWith({
      telegramUserId: "123",
      kind: "awaiting_draft_correction",
      payload: { draftId: "draft-1" }
    });
    expect(dependencies.sendTelegramMessage).toHaveBeenCalledWith({
      fetcher: dependencies.fetcher,
      botToken: "token",
      chatId: 456,
      text: "Напиши исправление следующим сообщением. Можно коротко: «сумма 100000», «это не долг, а мои деньги у человека», или полную новую формулировку.",
      buttons: []
    });
    expect(result).toEqual({
      ok: true,
      handled: "callback",
      callbackAction: "edit",
      draftId: "draft-1"
    });
  });

  it("continues the edit flow when Telegram callback answering fails", async () => {
    const dependencies = createDependencies();
    dependencies.answerTelegramCallbackQuery.mockRejectedValue(new Error("callback expired"));

    const result = await processTelegramUpdate({
      ...dependencies,
      update: {
        callback_query: {
          id: "callback-edit",
          from: { id: 123 },
          message: { chat: { id: 456 } },
          data: "draft:draft-1:edit"
        }
      }
    });

    expect(dependencies.setConversationState).toHaveBeenCalledWith({
      telegramUserId: "123",
      kind: "awaiting_draft_correction",
      payload: { draftId: "draft-1" }
    });
    expect(dependencies.sendTelegramMessage).toHaveBeenCalledWith({
      fetcher: dependencies.fetcher,
      botToken: "token",
      chatId: 456,
      text: "Напиши исправление следующим сообщением. Можно коротко: «сумма 100000», «это не долг, а мои деньги у человека», или полную новую формулировку.",
      buttons: []
    });
    expect(result).toEqual({
      ok: true,
      handled: "callback",
      callbackAction: "edit",
      draftId: "draft-1"
    });
  });

  it("creates a replacement draft through the correction service after edit-state text", async () => {
    const dependencies = createDependencies();
    dependencies.getConversationState.mockResolvedValue({
      kind: "awaiting_draft_correction",
      payload: { draftId: "draft-old" }
    });
    dependencies.correctDraft.mockResolvedValue({
      id: "draft-new",
      parsedActions: { summary: "Исправленный черновик." }
    });

    const result = await processTelegramUpdate({
      ...dependencies,
      update: {
        message: {
          chat: { id: 456 },
          from: { id: 123 },
          text: "сумма 100000"
        }
      }
    });

    expect(dependencies.parseMessage).not.toHaveBeenCalled();
    expect(dependencies.rejectDraft).not.toHaveBeenCalled();
    expect(dependencies.correctDraft).toHaveBeenCalledWith({
      draftId: "draft-old",
      text: "сумма 100000",
      source: "telegram_text"
    });
    expect(dependencies.clearConversationState).toHaveBeenCalledWith("123");
    expect(dependencies.sendTelegramMessage).toHaveBeenCalledWith({
      fetcher: dependencies.fetcher,
      botToken: "token",
      chatId: 456,
      text: "Черновик: Исправленный черновик.",
      buttons: [
        { text: "Сохранить", callbackData: "draft:draft-new:confirm" },
        { text: "Исправить", callbackData: "draft:draft-new:edit" },
        { text: "Отмена", callbackData: "draft:draft-new:reject" }
      ]
    });
    expect(result).toEqual({ ok: true, handled: "text" });
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
