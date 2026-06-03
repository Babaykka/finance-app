import { type Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SourceSchema } from "@/domain/enums";
import { AiParseResultSchema, type AiParseResult } from "@/server/ai/schema";

export const CreateAiDraftSchema = z.object({
  ownerId: z.string().min(1),
  source: SourceSchema,
  rawText: z.string().min(1),
  transcript: z.string().optional(),
  parseResult: AiParseResultSchema
});

type DraftDb = {
  aiDraft: Pick<PrismaClient["aiDraft"], "create">;
};

const toPrismaJson = (parseResult: AiParseResult): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(parseResult)) as Prisma.InputJsonValue;

export async function createAiDraft(db: DraftDb, rawInput: unknown) {
  const input = CreateAiDraftSchema.parse(rawInput);
  const status =
    input.parseResult.needsClarification.length > 0 ? "needs_clarification" : "pending";

  return db.aiDraft.create({
    data: {
      ownerId: input.ownerId,
      source: input.source,
      rawText: input.rawText,
      transcript: input.transcript,
      parsedActions: toPrismaJson(input.parseResult),
      confidence: input.parseResult.confidence,
      status
    }
  });
}
