import type { TelegramInlineButton } from "./bot";

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Pick<Response, "json" | "ok" | "status">>;

type TelegramApiResponse<T> = {
  ok?: boolean;
  result?: T;
  description?: string;
};

type TelegramCommand = {
  command: string;
  description: string;
};

const telegramApiUrl = (botToken: string, method: string) =>
  `https://api.telegram.org/bot${botToken}/${method}`;

async function postTelegramApi<T>(
  fetcher: Fetcher,
  botToken: string,
  method: string,
  body: Record<string, unknown>
) {
  const response = await fetcher(telegramApiUrl(botToken, method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Telegram ${method} failed with HTTP ${response.status}`);
  }

  const json = (await response.json()) as TelegramApiResponse<T>;
  if (!json.ok) {
    throw new Error(`Telegram ${method} failed: ${json.description ?? "unknown error"}`);
  }

  return json.result as T;
}

export async function sendTelegramMessage(input: {
  fetcher: Fetcher;
  botToken: string;
  chatId: number;
  messageThreadId?: number;
  directMessagesTopicId?: number;
  text: string;
  buttons: TelegramInlineButton[];
}) {
  const body: Record<string, unknown> = {
    chat_id: input.chatId
  };

  if (input.messageThreadId !== undefined) {
    body.message_thread_id = input.messageThreadId;
  }

  if (input.directMessagesTopicId !== undefined) {
    body.direct_messages_topic_id = input.directMessagesTopicId;
  }

  body.text = input.text;

  if (input.buttons.length > 0) {
    body.reply_markup = {
      inline_keyboard: [
        input.buttons.map((button) => ({
          text: button.text,
          callback_data: button.callbackData
        }))
      ]
    };
  }

  const response = await input.fetcher(telegramApiUrl(input.botToken, "sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed with HTTP ${response.status}`);
  }
}

export async function answerTelegramCallbackQuery(input: {
  fetcher: Fetcher;
  botToken: string;
  callbackQueryId: string;
  text: string;
}) {
  await postTelegramApi(input.fetcher, input.botToken, "answerCallbackQuery", {
    callback_query_id: input.callbackQueryId,
    text: input.text
  });
}

export async function deleteTelegramWebhook(input: {
  fetcher: Fetcher;
  botToken: string;
  dropPendingUpdates: boolean;
}) {
  await postTelegramApi(input.fetcher, input.botToken, "deleteWebhook", {
    drop_pending_updates: input.dropPendingUpdates
  });
}

export async function getTelegramUpdates(input: {
  fetcher: Fetcher;
  botToken: string;
  offset?: number;
  timeout: number;
  allowedUpdates: string[];
}) {
  const body: Record<string, unknown> = {};

  if (input.offset !== undefined) {
    body.offset = input.offset;
  }

  body.timeout = input.timeout;
  body.allowed_updates = input.allowedUpdates;

  return postTelegramApi<unknown[]>(input.fetcher, input.botToken, "getUpdates", body);
}

export async function setTelegramChatMenuButton(input: {
  fetcher: Fetcher;
  botToken: string;
  chatId?: number;
  text: string;
  webAppUrl: string;
}) {
  const body: Record<string, unknown> = {
    menu_button: {
      type: "web_app",
      text: input.text,
      web_app: {
        url: input.webAppUrl
      }
    }
  };

  if (input.chatId !== undefined) {
    body.chat_id = input.chatId;
  }

  await postTelegramApi(input.fetcher, input.botToken, "setChatMenuButton", body);
}

export async function setTelegramCommands(input: {
  fetcher: Fetcher;
  botToken: string;
  commands: TelegramCommand[];
}) {
  await postTelegramApi(input.fetcher, input.botToken, "setMyCommands", {
    commands: input.commands
  });
}

export async function setTelegramWebhook(input: {
  fetcher: Fetcher;
  botToken: string;
  url: string;
  secretToken: string;
}) {
  await postTelegramApi(input.fetcher, input.botToken, "setWebhook", {
    url: input.url,
    secret_token: input.secretToken,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false
  });
}
