import { describe, expect, it } from "vitest";
import { buildTelegramWebhookUrl, isTelegramMiniAppUrl } from "@/server/telegram/setup";

describe("Telegram setup helpers", () => {
  it("accepts public HTTPS URLs for Mini App menu setup", () => {
    expect(isTelegramMiniAppUrl("https://finance.example.com")).toBe(true);
  });

  it("rejects local HTTP URLs for Mini App menu setup", () => {
    expect(isTelegramMiniAppUrl("http://localhost:3000")).toBe(false);
    expect(isTelegramMiniAppUrl("http://127.0.0.1:3000")).toBe(false);
  });

  it("builds the webhook endpoint from the public app URL", () => {
    expect(buildTelegramWebhookUrl("https://finance.example.com/")).toBe(
      "https://finance.example.com/api/telegram/webhook"
    );
  });
});
