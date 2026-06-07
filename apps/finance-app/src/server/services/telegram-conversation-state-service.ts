import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

export const TelegramConversationStateKindSchema = z.enum([
  "awaiting_storage_rename_name",
  "awaiting_draft_correction"
]);
export type TelegramConversationStateKind = z.infer<
  typeof TelegramConversationStateKindSchema
>;

const JsonObjectSchema = z.record(z.string(), z.unknown());

export const SetTelegramConversationStateSchema = z.object({
  telegramUserId: z.string().min(1),
  kind: TelegramConversationStateKindSchema,
  payload: JsonObjectSchema,
  ttlSeconds: z.number().int().positive().default(15 * 60),
  now: z.date().default(() => new Date())
});

type SetTelegramConversationStateInput = z.input<
  typeof SetTelegramConversationStateSchema
>;

type TelegramConversationStateDb = {
  telegramConversationState: Pick<
    PrismaClient["telegramConversationState"],
    "upsert" | "findUnique" | "deleteMany"
  >;
};

const toPrismaJson = (payload: Record<string, unknown>): Prisma.InputJsonObject =>
  JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonObject;

export async function setTelegramConversationState(
  db: Pick<TelegramConversationStateDb, "telegramConversationState">,
  rawInput: SetTelegramConversationStateInput
) {
  const input = SetTelegramConversationStateSchema.parse(rawInput);
  const expiresAt = new Date(input.now.getTime() + input.ttlSeconds * 1000);
  const payload = toPrismaJson(input.payload);

  return db.telegramConversationState.upsert({
    where: { telegramUserId: input.telegramUserId },
    create: {
      telegramUserId: input.telegramUserId,
      kind: input.kind,
      payload,
      expiresAt
    },
    update: {
      kind: input.kind,
      payload,
      expiresAt
    }
  });
}

const parseStatePayload = (value: unknown): Record<string, unknown> => {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
};

export async function getTelegramConversationState(
  db: Pick<TelegramConversationStateDb, "telegramConversationState">,
  input: { telegramUserId: string; now?: Date }
) {
  const now = input.now ?? new Date();
  const state = await db.telegramConversationState.findUnique({
    where: { telegramUserId: input.telegramUserId }
  });

  if (!state) {
    return null;
  }

  if (state.expiresAt <= now) {
    await clearTelegramConversationState(db, input.telegramUserId);
    return null;
  }

  return {
    kind: TelegramConversationStateKindSchema.parse(state.kind),
    payload: parseStatePayload(state.payload)
  };
}

export async function clearTelegramConversationState(
  db: Pick<TelegramConversationStateDb, "telegramConversationState">,
  telegramUserId: string
) {
  return db.telegramConversationState.deleteMany({
    where: { telegramUserId }
  });
}
