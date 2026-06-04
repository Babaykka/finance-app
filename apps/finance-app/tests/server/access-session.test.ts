import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAccessSession, verifyAccessSession } from "@/server/auth/access-session";

describe("access sessions", () => {
  const originalSessionSecret = process.env.SESSION_SECRET;
  const originalWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const now = new Date("2026-06-04T10:00:00.000Z");

  beforeEach(() => {
    process.env.SESSION_SECRET = "session-secret";
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
  });

  afterEach(() => {
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

  it("creates and verifies signed access sessions", async () => {
    const token = await createAccessSession(
      {
        sub: "telegram:123",
        provider: "telegram",
        telegramUserId: "123"
      },
      { now, maxAgeSeconds: 60 }
    );

    await expect(verifyAccessSession(token, { now })).resolves.toMatchObject({
      sub: "telegram:123",
      provider: "telegram",
      telegramUserId: "123"
    });
  });

  it("rejects tampered and expired sessions", async () => {
    const token = await createAccessSession(
      {
        sub: "telegram:123",
        provider: "telegram",
        telegramUserId: "123"
      },
      { now, maxAgeSeconds: 60 }
    );

    await expect(verifyAccessSession(`${token}x`, { now })).resolves.toBeNull();
    await expect(
      verifyAccessSession(token, { now: new Date(now.getTime() + 61_000) })
    ).resolves.toBeNull();
  });
});
