export function isTelegramMiniAppUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname !== "localhost";
  } catch {
    return false;
  }
}

export function buildTelegramWebhookUrl(appBaseUrl: string) {
  return new URL("/api/telegram/webhook", appBaseUrl).toString();
}
