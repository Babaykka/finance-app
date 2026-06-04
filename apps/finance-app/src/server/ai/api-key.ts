export function normalizeOpenAiApiKey(rawValue: string | undefined) {
  const firstLine =
    rawValue
      ?.split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";
  const trimmed = firstLine.replace(/^OPENAI_API_KEY\s*=\s*/i, "").trim();
  const quote = trimmed[0];

  if (
    trimmed.length >= 2 &&
    (quote === "\"" || quote === "'") &&
    trimmed[trimmed.length - 1] === quote
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

export function getOpenAiApiKey() {
  const apiKey = normalizeOpenAiApiKey(process.env.OPENAI_API_KEY);

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for AI parsing");
  }

  return apiKey;
}
