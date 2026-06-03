import { setTimeout as delay } from "node:timers/promises";
import { getOpenAiClient } from "../src/server/ai/openai-adapter";
import type { OpenAiTranscriptionClient } from "../src/server/ai/transcription";
import { transcribeAudioFile } from "../src/server/ai/transcription";
import {
  answerTelegramCallbackQuery,
  deleteTelegramWebhook,
  getTelegramUpdates,
  sendTelegramMessage
} from "../src/server/telegram/client";
import { processTelegramUpdate } from "../src/server/telegram/update";
import { downloadTelegramVoiceFile } from "../src/server/telegram/voice";
import { loadLocalEnv, optionalEnv, requireEnv } from "./env";

const DEFAULT_APP_BASE_URL = "http://localhost:3000";
const DEFAULT_POLL_TIMEOUT_SECONDS = 25;
const RETRY_DELAY_MS = 2000;
const ALLOWED_UPDATES = ["message", "callback_query"];

type DraftResult = {
  id: string;
  parsedActions: unknown;
};

type TelegramUpdateLike = {
  update_id?: unknown;
  message?: {
    chat?: { id?: unknown; type?: unknown };
    message_thread_id?: unknown;
  };
  callback_query?: {
    message?: {
      chat?: { id?: unknown; type?: unknown };
      message_thread_id?: unknown;
    };
  };
};

const hasFlag = (name: string) => process.argv.includes(name);

const normalizeBaseUrl = (value: string) => {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
};

async function postJson<T>(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    json = undefined;
  }

  if (!response.ok) {
    throw new Error(`${url} failed with HTTP ${response.status}`);
  }

  return json as T;
}

async function postDraftMutation(url: string) {
  const response = await fetch(url, {
    method: "POST"
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  return {
    ok: response.ok,
    status: response.status,
    body
  };
}

const getUpdateId = (update: unknown) => {
  const candidate = update as TelegramUpdateLike;
  return typeof candidate.update_id === "number" ? candidate.update_id : undefined;
};

const getUpdateChatId = (update: unknown) => {
  const candidate = update as TelegramUpdateLike;
  const chatId = candidate.message?.chat?.id ?? candidate.callback_query?.message?.chat?.id;
  return typeof chatId === "number" ? chatId : undefined;
};

const getUpdateChatType = (update: unknown) => {
  const candidate = update as TelegramUpdateLike;
  const chatType = candidate.message?.chat?.type ?? candidate.callback_query?.message?.chat?.type;
  return typeof chatType === "string" ? chatType : undefined;
};

const getUpdateMessageThreadId = (update: unknown) => {
  const candidate = update as TelegramUpdateLike;
  const messageThreadId =
    candidate.message?.message_thread_id ?? candidate.callback_query?.message?.message_thread_id;
  return typeof messageThreadId === "number" ? messageThreadId : undefined;
};

async function sendProcessingError(botToken: string, update: unknown) {
  const chatId = getUpdateChatId(update);
  if (chatId === undefined) {
    return;
  }

  await sendTelegramMessage({
    fetcher: fetch,
    botToken,
    chatId,
    ...(getUpdateMessageThreadId(update) !== undefined
      ? getUpdateChatType(update) === "private"
        ? { directMessagesTopicId: getUpdateMessageThreadId(update) }
        : { messageThreadId: getUpdateMessageThreadId(update) }
      : {}),
    text: "Не смог обработать сообщение. Проверь, что сайт запущен, и отправь еще раз.",
    buttons: []
  });
}

async function main() {
  loadLocalEnv();

  const botToken = requireEnv("TELEGRAM_BOT_TOKEN");
  const appBaseUrl = normalizeBaseUrl(optionalEnv("APP_BASE_URL") ?? DEFAULT_APP_BASE_URL);
  const allowedUserId = optionalEnv("TELEGRAM_ALLOWED_USER_ID");
  const once = hasFlag("--once");
  const dropPendingUpdates =
    hasFlag("--drop-pending") || process.env.TELEGRAM_POLL_DROP_PENDING_UPDATES === "true";

  await deleteTelegramWebhook({
    fetcher: fetch,
    botToken,
    dropPendingUpdates
  });

  console.log(
    `[telegram] polling started: app=${appBaseUrl}, once=${once ? "yes" : "no"}, dropPending=${dropPendingUpdates ? "yes" : "no"}`
  );

  let offset: number | undefined;

  while (true) {
    try {
      const updates = await getTelegramUpdates({
        fetcher: fetch,
        botToken,
        offset,
        timeout: DEFAULT_POLL_TIMEOUT_SECONDS,
        allowedUpdates: ALLOWED_UPDATES
      });

      for (const update of updates) {
        const updateId = getUpdateId(update);
        if (updateId !== undefined) {
          offset = updateId + 1;
        }

        try {
          const result = await processTelegramUpdate({
            update,
            fetcher: fetch,
            botToken,
            allowedUserId,
            transcribeModel: optionalEnv("OPENAI_TRANSCRIBE_MODEL"),
            parseMessage: (body) =>
              postJson<DraftResult>(new URL("/api/parse-message", appBaseUrl).toString(), body),
            confirmDraft: (draftId) =>
              postDraftMutation(
                new URL(`/api/ai-drafts/${encodeURIComponent(draftId)}/confirm`, appBaseUrl)
                  .toString()
              ),
            rejectDraft: (draftId) =>
              postDraftMutation(
                new URL(`/api/ai-drafts/${encodeURIComponent(draftId)}/reject`, appBaseUrl)
                  .toString()
              ),
            sendTelegramMessage,
            answerTelegramCallbackQuery,
            downloadTelegramVoiceFile,
            transcribeAudioFile,
            getOpenAiClient: () => getOpenAiClient() as unknown as OpenAiTranscriptionClient
          });

          console.log(
            `[telegram] update ${updateId ?? "unknown"}: ${"handled" in result ? result.handled : "ignored"}`
          );
        } catch (error) {
          console.error(`[telegram] update ${updateId ?? "unknown"} failed`, error);
          await sendProcessingError(botToken, update);
        }
      }

      if (once) {
        break;
      }
    } catch (error) {
      console.error("[telegram] polling loop failed", error);
      if (once) {
        process.exitCode = 1;
        break;
      }

      await delay(RETRY_DELAY_MS);
    }
  }
}

main().catch((error) => {
  console.error("[telegram] polling crashed", error);
  process.exitCode = 1;
});
