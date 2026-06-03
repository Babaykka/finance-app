import type { TelegramInlineButton } from "./bot";

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Pick<Response, "ok" | "status">>;

export async function sendTelegramMessage(input: {
  fetcher: Fetcher;
  botToken: string;
  chatId: number;
  text: string;
  buttons: TelegramInlineButton[];
}) {
  const response = await input.fetcher(`https://api.telegram.org/bot${input.botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: input.chatId,
      text: input.text,
      reply_markup: {
        inline_keyboard: [
          input.buttons.map((button) => ({
            text: button.text,
            callback_data: button.callbackData
          }))
        ]
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed with HTTP ${response.status}`);
  }
}
