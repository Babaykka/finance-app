import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/auth/telegram/route";
import { ACCESS_SESSION_COOKIE } from "@/server/auth/access-session";

function signInitData(data: Record<string, string>, botToken: string) {
  const pairs = Object.entries(data)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = crypto.createHmac("sha256", secret).update(pairs).digest("hex");
  return new URLSearchParams({ ...data, hash }).toString();
}

const authRequest = (initData: string) =>
  new Request("http://localhost/api/auth/telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData })
  });

describe("Telegram auth route", () => {
  const originalBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalAllowedUserId = process.env.TELEGRAM_ALLOWED_USER_ID;
  const originalOwnerTelegramUserId = process.env.OWNER_TELEGRAM_USER_ID;
  const originalSessionSecret = process.env.SESSION_SECRET;
  const originalWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = "bot-token";
    process.env.TELEGRAM_ALLOWED_USER_ID = "123";
    process.env.SESSION_SECRET = "session-secret";
    delete process.env.OWNER_TELEGRAM_USER_ID;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
  });

  afterEach(() => {
    if (originalBotToken === undefined) {
      delete process.env.TELEGRAM_BOT_TOKEN;
    } else {
      process.env.TELEGRAM_BOT_TOKEN = originalBotToken;
    }

    if (originalAllowedUserId === undefined) {
      delete process.env.TELEGRAM_ALLOWED_USER_ID;
    } else {
      process.env.TELEGRAM_ALLOWED_USER_ID = originalAllowedUserId;
    }

    if (originalOwnerTelegramUserId === undefined) {
      delete process.env.OWNER_TELEGRAM_USER_ID;
    } else {
      process.env.OWNER_TELEGRAM_USER_ID = originalOwnerTelegramUserId;
    }

    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }

    if (originalWebhookSecret === undefined) {
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
    } else {
      process.env.TELEGRAM_WEBHOOK_SECRET = originalWebhookSecret;
    }
  });

  it("sets an access session cookie for the allowed Telegram user", async () => {
    const initData = signInitData(
      {
        auth_date: String(Math.floor(Date.now() / 1000)),
        user: JSON.stringify({ id: 123, first_name: "Owner" })
      },
      "bot-token"
    );

    const response = await POST(authRequest(initData));

    expect(response.status).toBe(200);
    expect(response.cookies.get(ACCESS_SESSION_COOKIE)?.value).toBeTruthy();
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("rejects valid Telegram users that are not allowed", async () => {
    const initData = signInitData(
      {
        auth_date: String(Math.floor(Date.now() / 1000)),
        user: JSON.stringify({ id: 999, first_name: "Other" })
      },
      "bot-token"
    );

    const response = await POST(authRequest(initData));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Telegram user is not allowed" });
  });
});
