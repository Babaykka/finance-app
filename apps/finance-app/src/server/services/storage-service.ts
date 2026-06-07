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
import { toAuditObject, writeAuditLog } from "./audit-service";

export const CreateStoragePlaceSchema = z.object({
  ownerId: z.string().min(1),
  actor: z.string().min(1),
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

type CreateStoragePlaceData = Omit<
  z.infer<typeof CreateStoragePlaceSchema>,
  "actor" | "source"
>;

export const UpdateStoragePlaceSchema = z
  .object({
    ownerId: z.string().min(1),
    actor: z.string().min(1),
    source: SourceSchema,
    storagePlaceId: z.string().min(1).optional(),
    currentName: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    type: StorageTypeSchema.optional(),
    subtype: StorageSubtypeSchema.optional(),
    holderContext: z.string().min(1).optional(),
    asset: AssetSchema.optional(),
    amount: z.number().nonnegative().optional(),
    amountKind: z.enum(["exact", "equivalent", "estimated"]).optional(),
    availability: AvailabilitySchema.optional(),
    rate: z.number().optional(),
    interestRule: z.string().optional(),
    interestPaymentDay: z.number().int().min(1).max(31).optional(),
    reviewOrEndDate: z.date().optional(),
    lastCheckedAt: z.date().optional(),
    status: StorageStatusSchema.optional(),
    attentionPriority: AttentionPrioritySchema.optional(),
    comment: z.string().optional()
  })
  .refine((input) => input.storagePlaceId !== undefined || input.currentName !== undefined, {
    message: "updateStoragePlace requires storagePlaceId or currentName"
  });

const UPDATE_STORAGE_FIELDS = [
  "name",
  "type",
  "subtype",
  "holderContext",
  "asset",
  "amount",
  "amountKind",
  "availability",
  "rate",
  "interestRule",
  "interestPaymentDay",
  "reviewOrEndDate",
  "lastCheckedAt",
  "status",
  "attentionPriority",
  "comment"
] as const;

type UpdateStorageField = (typeof UPDATE_STORAGE_FIELDS)[number];
type UpdateStoragePlaceData = Pick<z.infer<typeof UpdateStoragePlaceSchema>, UpdateStorageField>;

type CreateStorageTransactionDb = {
  storagePlace: Pick<PrismaClient["storagePlace"], "create">;
  auditLog: Pick<PrismaClient["auditLog"], "create">;
};

type UpdateStorageTransactionDb = {
  storagePlace: Pick<PrismaClient["storagePlace"], "findFirstOrThrow" | "update">;
  auditLog: Pick<PrismaClient["auditLog"], "create">;
};

type StorageDb<TTransactionDb> = TTransactionDb & Partial<Pick<PrismaClient, "$transaction">>;

const runInStorageTransaction = <T, TTransactionDb>(
  db: StorageDb<TTransactionDb>,
  action: (tx: TTransactionDb) => Promise<T>
) => {
  if (!db.$transaction) {
    return action(db);
  }

  return db.$transaction((tx) => action(tx as TTransactionDb));
};

const buildStorageUpdateData = (input: z.infer<typeof UpdateStoragePlaceSchema>) => {
  const data: Partial<UpdateStoragePlaceData> = {};

  for (const field of UPDATE_STORAGE_FIELDS) {
    if (input[field] !== undefined) {
      data[field] = input[field] as never;
    }
  }

  if (Object.keys(data).length === 0) {
    throw new Error("updateStoragePlace requires at least one changed field");
  }

  return data;
};

const toAuditCompatibleValue = (value: unknown) => {
  if (
    value !== null &&
    typeof value === "object" &&
    !(value instanceof Date) &&
    typeof value.toString === "function"
  ) {
    return value.toString();
  }

  return value;
};

const pickAuditValues = (
  record: Record<string, unknown>,
  fields: readonly string[]
): Record<string, unknown> =>
  Object.fromEntries(fields.map((field) => [field, toAuditCompatibleValue(record[field])]));

export async function createStoragePlace(
  db: StorageDb<CreateStorageTransactionDb>,
  rawInput: unknown
) {
  const input = CreateStoragePlaceSchema.parse(rawInput);
  const { actor, source, ...data } = input;
  const createData: Prisma.StoragePlaceUncheckedCreateInput =
    data satisfies CreateStoragePlaceData;

  return runInStorageTransaction(db, async (tx) => {
    const created = await tx.storagePlace.create({ data: createData });

    await writeAuditLog(tx, {
      ownerId: input.ownerId,
      actor,
      source,
      entityType: "StoragePlace",
      entityId: created.id,
      newValues: toAuditObject(data)
    });

    return created;
  });
}

export async function updateStoragePlace(
  db: StorageDb<UpdateStorageTransactionDb>,
  rawInput: unknown
) {
  const input = UpdateStoragePlaceSchema.parse(rawInput);
  const { actor, source, storagePlaceId, currentName } = input;
  const data = buildStorageUpdateData(input);
  const updateKeys = Object.keys(data);
  const updateData: Prisma.StoragePlaceUncheckedUpdateInput = data;

  return runInStorageTransaction(db, async (tx) => {
    const current = await tx.storagePlace.findFirstOrThrow({
      where:
        storagePlaceId !== undefined
          ? {
              ownerId: input.ownerId,
              id: storagePlaceId
            }
          : {
              ownerId: input.ownerId,
              name: currentName
            }
    });

    const updated = await tx.storagePlace.update({
      where: { id: current.id },
      data: updateData
    });

    await writeAuditLog(tx, {
      ownerId: input.ownerId,
      actor,
      source,
      entityType: "StoragePlace",
      entityId: current.id,
      oldValues: toAuditObject(pickAuditValues(current, updateKeys)),
      newValues: toAuditObject(data)
    });

    return updated;
  });
}
