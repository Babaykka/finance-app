import { AiParseResultSchema, type AiParseResult } from "./schema";

export type AiParserContext = {
  todayIso: string;
  timezone: string;
  knownDebts: Array<{ id: string; partyName: string; remainingAmount: number; asset: string }>;
  knownStoragePlaces: Array<{ id: string; name: string; asset: string; amount: number }>;
};

export interface AiParser {
  parseMessage(input: { text: string; context: AiParserContext }): Promise<AiParseResult>;
}

export function parseAiJson(json: unknown): AiParseResult {
  return AiParseResultSchema.parse(json);
}
