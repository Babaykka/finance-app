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
  it("verifies signed Telegram init data", () => {
    const botToken = "test-token";
    const initData = signInitData(
      {
        auth_date: "1780440000",
        user: JSON.stringify({ id: 123, first_name: "Hrach" })
      },
      botToken
    );

    const result = verifyTelegramInitData(initData, botToken);

    expect(result.user.id).toBe(123);
    expect(result.user.first_name).toBe("Hrach");
  });

  it("throws when hash is missing", () => {
    const initData = new URLSearchParams({
      auth_date: "1780440000",
      user: JSON.stringify({ id: 123, first_name: "Hrach" })
    }).toString();

    expect(() => verifyTelegramInitData(initData, "test-token")).toThrow(
      "Telegram init data is missing hash"
    );
  });

  it("throws on mismatched or malformed hashes without unsafe buffer compares", () => {
    const initData = new URLSearchParams({
      auth_date: "1780440000",
      user: JSON.stringify({ id: 123, first_name: "Hrach" }),
      hash: "bad"
    }).toString();

    expect(() => verifyTelegramInitData(initData, "test-token")).toThrow(
      "Telegram init data hash mismatch"
    );
  });
});
