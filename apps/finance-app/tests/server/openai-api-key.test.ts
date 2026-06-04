import { afterEach, describe, expect, it } from "vitest";
import { getOpenAiApiKey, normalizeOpenAiApiKey } from "@/server/ai/api-key";

describe("OpenAI API key helpers", () => {
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (originalOpenAiApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    }
  });

  it("trims whitespace and matching surrounding quotes", () => {
    expect(normalizeOpenAiApiKey("  sk-test  ")).toBe("sk-test");
    expect(normalizeOpenAiApiKey('  "sk-test"  ')).toBe("sk-test");
    expect(normalizeOpenAiApiKey("  'sk-test'  ")).toBe("sk-test");
  });

  it("keeps only the first key line when multiple env lines were pasted", () => {
    expect(
      normalizeOpenAiApiKey('sk-test\nTELEGRAM_ALLOWED_USER_ID="123"\nTELEGRAM_BOT_TOKEN="token"')
    ).toBe("sk-test");
    expect(normalizeOpenAiApiKey('OPENAI_API_KEY="sk-test"\nTELEGRAM_ALLOWED_USER_ID="123"')).toBe(
      "sk-test"
    );
  });

  it("returns an empty string for missing or blank values", () => {
    expect(normalizeOpenAiApiKey(undefined)).toBe("");
    expect(normalizeOpenAiApiKey("  ")).toBe("");
  });

  it("throws when the normalized env key is empty", () => {
    process.env.OPENAI_API_KEY = "  ";

    expect(() => getOpenAiApiKey()).toThrow("OPENAI_API_KEY is required for AI parsing");
  });

  it("returns the normalized env key", () => {
    process.env.OPENAI_API_KEY = '  "sk-test"  ';

    expect(getOpenAiApiKey()).toBe("sk-test");
  });
});
