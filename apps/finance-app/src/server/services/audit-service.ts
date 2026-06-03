import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SourceSchema } from "@/domain/enums";

type AuditDb = {
  auditLog: Pick<PrismaClient["auditLog"], "create">;
};

const isJsonInputValue = (value: unknown): value is Prisma.InputJsonValue => {
  if (value === null) {
    return false;
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every(isJsonArrayItem);
  }

  if (Object.prototype.toString.call(value) !== "[object Object]") {
    return false;
  }

  return Object.values(value as Record<string, unknown>).every(isJsonArrayItem);
};

const isJsonArrayItem = (value: unknown): value is Prisma.InputJsonValue | null => {
  if (value === null) {
    return true;
  }

  return isJsonInputValue(value);
};

const JsonInputValueSchema = z.custom<Prisma.InputJsonValue>(isJsonInputValue, {
  message: "Expected a JSON-compatible value"
});

const WriteAuditLogInputSchema = z.object({
  ownerId: z.string().min(1),
  actor: z.string().min(1),
  source: SourceSchema,
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  oldValues: JsonInputValueSchema.optional(),
  newValues: JsonInputValueSchema.optional(),
  aiDraftId: z.string().min(1).optional()
});

export type WriteAuditLogInput = z.input<typeof WriteAuditLogInputSchema>;

export const toAuditJsonValue = (
  value: unknown
): Prisma.InputJsonValue | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Audit values must contain only finite numbers");
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toAuditJsonValue(item) ?? null);
  }

  if (typeof value === "object") {
    return toAuditObject(value as Record<string, unknown>);
  }

  throw new Error("Audit values must be JSON-compatible");
};

export const toAuditObject = (input: Record<string, unknown>): Prisma.InputJsonObject => {
  const output: Record<string, Prisma.InputJsonValue | null> = {};

  for (const [key, value] of Object.entries(input)) {
    const jsonValue = toAuditJsonValue(value);

    if (jsonValue !== undefined) {
      output[key] = jsonValue;
    }
  }

  return output;
};

export const writeAuditLog = async (db: AuditDb, input: unknown) => {
  const data: Prisma.AuditLogUncheckedCreateInput = WriteAuditLogInputSchema.parse(input);

  return db.auditLog.create({ data });
};
