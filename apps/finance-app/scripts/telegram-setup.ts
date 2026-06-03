import {
  setTelegramChatMenuButton,
  setTelegramCommands,
  setTelegramWebhook
} from "../src/server/telegram/client";
import {
  buildTelegramWebhookUrl,
  isTelegramMiniAppUrl
} from "../src/server/telegram/setup";
import { loadLocalEnv, optionalEnv, requireEnv } from "./env";

const DEFAULT_APP_BASE_URL = "http://localhost:3000";
const DEFAULT_MENU_TEXT = "Финансы";

const normalizeBaseUrl = (value: string) => {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
};

async function main() {
  loadLocalEnv();

  const botToken = requireEnv("TELEGRAM_BOT_TOKEN");
  const appBaseUrl = normalizeBaseUrl(optionalEnv("APP_BASE_URL") ?? DEFAULT_APP_BASE_URL);
  const webhookSecret = optionalEnv("TELEGRAM_WEBHOOK_SECRET");
  const menuText = optionalEnv("TELEGRAM_MENU_TEXT") ?? DEFAULT_MENU_TEXT;

  await setTelegramCommands({
    fetcher: fetch,
    botToken,
    commands: [
      { command: "start", description: "Открыть финансового помощника" },
      { command: "help", description: "Как отправлять финансовые события" }
    ]
  });
  console.log("[telegram] bot commands updated");

  if (!isTelegramMiniAppUrl(appBaseUrl)) {
    console.log(
      `[telegram] Mini App menu skipped: APP_BASE_URL must be a public HTTPS URL, current APP_BASE_URL=${appBaseUrl}`
    );
    console.log("[telegram] For local development run: npm run bot:poll");
    return;
  }

  await setTelegramChatMenuButton({
    fetcher: fetch,
    botToken,
    text: menuText,
    webAppUrl: appBaseUrl
  });
  console.log(`[telegram] Mini App menu button set to ${appBaseUrl}`);

  if (!webhookSecret) {
    console.log("[telegram] webhook skipped: TELEGRAM_WEBHOOK_SECRET is missing");
    return;
  }

  const webhookUrl = buildTelegramWebhookUrl(appBaseUrl);
  await setTelegramWebhook({
    fetcher: fetch,
    botToken,
    url: webhookUrl,
    secretToken: webhookSecret
  });
  console.log(`[telegram] webhook set to ${webhookUrl}`);
}

main().catch((error) => {
  console.error("[telegram] setup failed", error);
  process.exitCode = 1;
});
