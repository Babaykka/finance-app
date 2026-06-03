import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  AssetSchema,
  AttentionPrioritySchema,
  AvailabilitySchema,
  SourceSchema,
  StorageStatusSchema,
  StorageSubtypeSchema,
  StorageTypeSchema
} from "@/domain/enums";
import { writeAuditLog } from "./audit-service";

export const CreateStoragePlaceSchema = z.object({
  ownerId: z.string(),
  actor: z.string(),
  source: SourceSchema,
  name: z.string().min(1),
  type: StorageTypeSchema,
  subtype: StorageSubtypeSchema,
  holderContext: z.string().min(1),
  asset: AssetSchema,
  amount: z.number().nonnegative(),
  amountKind: z.enum(["exact", "equivalent", "estimated"]),
  availability: AvailabilitySchema,
  rate: z.number().optional(),
  interestRule: z.string().optional(),
  interestPaymentDay: z.number().int().min(1).max(31).optional(),
  reviewOrEndDate: z.date().optional(),
  lastCheckedAt: z.date().optional(),
  status: StorageStatusSchema,
  attentionPriority: AttentionPrioritySchema,
  comment: z.string().optional()
});

type StorageDb = {
  storagePlace: Pick<PrismaClient["storagePlace"], "create">;
  auditLog: Pick<PrismaClient["auditLog"], "create">;
};

type CreateStoragePlaceData = Omit<
  z.infer<typeof CreateStoragePlaceSchema>,
  "actor" | "source"
>;

const toAuditJsonValue = (value: unknown): Prisma.InputJsonValue | null | undefined => {
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

const toAuditObject = (input: Record<string, unknown>): Prisma.InputJsonObject => {
  const output: Record<string, Prisma.InputJsonValue | null> = {};

  for (const [key, value] of Object.entries(input)) {
    const jsonValue = toAuditJsonValue(value);

    if (jsonValue !== undefined) {
      output[key] = jsonValue;
    }
  }

  return output;
};

export async function createStoragePlace(db: StorageDb, rawInput: unknown) {
  const input = CreateStoragePlaceSchema.parse(rawInput);
  const { actor, source, ...data } = input;
  const createData: Prisma.StoragePlaceUncheckedCreateInput =
    data satisfies CreateStoragePlaceData;
  const created = await db.storagePlace.create({ data: createData });

  await writeAuditLog(db, {
    ownerId: input.ownerId,
    actor,
    source,
    entityType: "StoragePlace",
    entityId: created.id,
    newValues: toAuditObject(data)
  });

  return created;
}
