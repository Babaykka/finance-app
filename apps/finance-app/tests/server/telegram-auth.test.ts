import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyTelegramInitData } from "@/server/auth/telegram";

function signInitData(data: Record<string, string>, botToken: string) {
  const pairs = Object.entries(data)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = crypto.createHmac("sha256", secret).update(pairs).digest("hex");
  return new URLSearchParams({ ...data, hash }).toString();
}

describe("verifyTelegramInitData", () => {
  const now = new Date("2026-06-03T12:00:00.000Z");
  const nowSeconds = String(Math.floor(now.getTime() / 1000));

  it("verifies signed Telegram init data", () => {
    const botToken = "test-token";
    const initData = signInitData(
      {
        auth_date: nowSeconds,
        user: JSON.stringify({ id: 123, first_name: "Owner" })
      },
      botToken
    );

    const result = verifyTelegramInitData(initData, botToken, { now });

    expect(result.user.id).toBe(123);
    expect(result.user.first_name).toBe("Owner");
  });

  it("throws when hash is missing", () => {
    const initData = new URLSearchParams({
      auth_date: nowSeconds,
      user: JSON.stringify({ id: 123, first_name: "Owner" })
    }).toString();

    expect(() => verifyTelegramInitData(initData, "test-token")).toThrow(
      "Telegram init data is missing hash"
    );
  });

  it("throws on mismatched or malformed hashes without unsafe buffer compares", () => {
    const initData = new URLSearchParams({
      auth_date: nowSeconds,
      user: JSON.stringify({ id: 123, first_name: "Owner" }),
      hash: "bad"
    }).toString();

    expect(() => verifyTelegramInitData(initData, "test-token")).toThrow(
      "Telegram init data hash mismatch"
    );
  });

  it("throws when auth_date is missing from otherwise signed init data", () => {
    const initData = signInitData(
      {
        user: JSON.stringify({ id: 123, first_name: "Owner" })
      },
      "test-token"
    );

    expect(() => verifyTelegramInitData(initData, "test-token", { now })).toThrow(
      "Telegram init data is missing auth_date"
    );
  });

  it("throws when auth_date is not numeric", () => {
    const initData = signInitData(
      {
        auth_date: "not-a-number",
        user: JSON.stringify({ id: 123, first_name: "Owner" })
      },
      "test-token"
    );

    expect(() => verifyTelegramInitData(initData, "test-token", { now })).toThrow(
      "Telegram init data auth_date is invalid"
    );
  });

  it("throws when signed init data is stale", () => {
    const staleSeconds = String(Math.floor(now.getTime() / 1000) - 24 * 60 * 60 - 1);
    const initData = signInitData(
      {
        auth_date: staleSeconds,
        user: JSON.stringify({ id: 123, first_name: "Owner" })
      },
      "test-token"
    );

    expect(() => verifyTelegramInitData(initData, "test-token", { now })).toThrow(
      "Telegram init data is stale"
    );
  });
});
