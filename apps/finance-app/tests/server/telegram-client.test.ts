import { describe, expect, it, vi } from "vitest";
import { sendTelegramMessage } from "@/server/telegram/client";

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
});
