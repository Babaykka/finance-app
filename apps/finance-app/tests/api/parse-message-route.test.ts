import { describe, expect, it } from "vitest";
import { ParseMessageRequestSchema, POST } from "@/app/api/parse-message/route";

describe("parse-message route request schema", () => {
  it("defaults source to web_text", () => {
    expect(ParseMessageRequestSchema.parse({ text: "создай долг" })).toEqual({
      text: "создай долг",
      source: "web_text"
    });
  });

  it("accepts telegram_text requests", () => {
    expect(
      ParseMessageRequestSchema.parse({
        text: "Геворг вернул 10000",
        source: "telegram_text"
      }).source
    ).toBe("telegram_text");
  });

  it("accepts telegram_voice requests with a transcript", () => {
    expect(
      ParseMessageRequestSchema.parse({
        text: "Геворг вернул 10000",
        source: "telegram_voice",
        transcript: "Геворг вернул 10000"
      })
    ).toEqual({
      text: "Геворг вернул 10000",
      source: "telegram_voice",
      transcript: "Геворг вернул 10000"
    });
  });

  it("rejects invalid POST bodies before resolving the local owner", async () => {
    const originalTelegramUserId = process.env.OWNER_TELEGRAM_USER_ID;
    delete process.env.OWNER_TELEGRAM_USER_ID;

    try {
      await expect(
        POST(
          new Request("http://localhost/api/parse-message", {
            method: "POST",
            body: JSON.stringify({})
          })
        )
      ).rejects.toThrow();
    } finally {
      if (originalTelegramUserId === undefined) {
        delete process.env.OWNER_TELEGRAM_USER_ID;
      } else {
        process.env.OWNER_TELEGRAM_USER_ID = originalTelegramUserId;
      }
    }
  });
});
