import { describe, expect, it, vi } from "vitest";
import {
  answerTelegramCallbackQuery,
  deleteTelegramWebhook,
  getTelegramUpdates,
  sendTelegramChatAction,
  sendTelegramMessage,
  setTelegramChatMenuButton,
  setTelegramCommands,
  setTelegramWebhook
} from "@/server/telegram/client";

describe("sendTelegramMessage", () => {
  it("posts message and inline buttons to Telegram API", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200
    });

    await sendTelegramMessage({
      fetcher,
      botToken: "token",
      chatId: 123,
      text: "Черновик",
      buttons: [{ text: "Сохранить", callbackData: "draft:1:confirm" }]
    });

    expect(fetcher).toHaveBeenCalledWith("https://api.telegram.org/bottoken/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: 123,
        text: "Черновик",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Сохранить",
                callback_data: "draft:1:confirm"
              }
            ]
          ]
        }
      })
    });
  });

  it("throws on non-ok Telegram responses", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 500
    });

    await expect(
      sendTelegramMessage({
        fetcher,
        botToken: "token",
        chatId: 123,
        text: "Черновик",
        buttons: []
      })
    ).rejects.toThrow("Telegram sendMessage failed with HTTP 500");
  });

  it("omits reply_markup when there are no buttons", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200
    });

    await sendTelegramMessage({
      fetcher,
      botToken: "token",
      chatId: 123,
      text: "Сохранено",
      buttons: []
    });

    expect(fetcher).toHaveBeenCalledWith("https://api.telegram.org/bottoken/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: 123,
        text: "Сохранено"
      })
    });
  });

  it("sends replies into the same Telegram topic when messageThreadId is present", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200
    });

    await sendTelegramMessage({
      fetcher,
      botToken: "token",
      chatId: 123,
      messageThreadId: 456,
      text: "Черновик",
      buttons: []
    });

    expect(fetcher).toHaveBeenCalledWith("https://api.telegram.org/bottoken/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: 123,
        message_thread_id: 456,
        text: "Черновик"
      })
    });
  });

  it("sends replies into a private direct-message topic", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200
    });

    await sendTelegramMessage({
      fetcher,
      botToken: "token",
      chatId: 123,
      directMessagesTopicId: 456,
      text: "Черновик",
      buttons: []
    });

    expect(fetcher).toHaveBeenCalledWith("https://api.telegram.org/bottoken/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: 123,
        direct_messages_topic_id: 456,
        text: "Черновик"
      })
    });
  });
});

describe("Telegram Bot API helpers", () => {
  it("sends typing chat actions", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ ok: true, result: true })
    });

    await sendTelegramChatAction({
      fetcher,
      botToken: "token",
      chatId: 123,
      action: "typing"
    });

    expect(fetcher).toHaveBeenCalledWith("https://api.telegram.org/bottoken/sendChatAction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: 123,
        action: "typing"
      })
    });
  });

  it("answers callback queries", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ ok: true, result: true })
    });

    await answerTelegramCallbackQuery({
      fetcher,
      botToken: "token",
      callbackQueryId: "callback-1",
      text: "Сохранено"
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.telegram.org/bottoken/answerCallbackQuery",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: "callback-1",
          text: "Сохранено"
        })
      }
    );
  });

  it("removes webhook before long polling", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ ok: true, result: true })
    });

    await deleteTelegramWebhook({
      fetcher,
      botToken: "token",
      dropPendingUpdates: false
    });

    expect(fetcher).toHaveBeenCalledWith("https://api.telegram.org/bottoken/deleteWebhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        drop_pending_updates: false
      })
    });
  });

  it("receives updates through long polling", async () => {
    const updates = [{ update_id: 10, message: { text: "test" } }];
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ ok: true, result: updates })
    });

    await expect(
      getTelegramUpdates({
        fetcher,
        botToken: "token",
        offset: 10,
        timeout: 25,
        allowedUpdates: ["message", "callback_query"]
      })
    ).resolves.toEqual(updates);

    expect(fetcher).toHaveBeenCalledWith("https://api.telegram.org/bottoken/getUpdates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offset: 10,
        timeout: 25,
        allowed_updates: ["message", "callback_query"]
      })
    });
  });

  it("sets a Mini App menu button", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ ok: true, result: true })
    });

    await setTelegramChatMenuButton({
      fetcher,
      botToken: "token",
      text: "Финансы",
      webAppUrl: "https://finance.example.com"
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.telegram.org/bottoken/setChatMenuButton",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menu_button: {
            type: "web_app",
            text: "Финансы",
            web_app: {
              url: "https://finance.example.com"
            }
          }
        })
      }
    );
  });

  it("sets bot commands and webhook", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ ok: true, result: true })
    });

    await setTelegramCommands({
      fetcher,
      botToken: "token",
      commands: [{ command: "start", description: "Открыть меню" }]
    });
    await setTelegramWebhook({
      fetcher,
      botToken: "token",
      url: "https://finance.example.com/api/telegram/webhook",
      secretToken: "secret"
    });

    expect(fetcher).toHaveBeenNthCalledWith(1, "https://api.telegram.org/bottoken/setMyCommands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commands: [{ command: "start", description: "Открыть меню" }]
      })
    });
    expect(fetcher).toHaveBeenNthCalledWith(2, "https://api.telegram.org/bottoken/setWebhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://finance.example.com/api/telegram/webhook",
        secret_token: "secret",
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: false
      })
    });
  });
});
