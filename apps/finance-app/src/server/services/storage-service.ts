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

type StorageTransactionDb = {
  storagePlace: Pick<PrismaClient["storagePlace"], "create">;
  auditLog: Pick<PrismaClient["auditLog"], "create">;
};

type StorageDb = StorageTransactionDb & Partial<Pick<PrismaClient, "$transaction">>;

const runInStorageTransaction = <T>(
  db: StorageDb,
  action: (tx: StorageTransactionDb) => Promise<T>
) => {
  if (!db.$transaction) {
    return action(db);
  }

  return db.$transaction((tx) => action(tx as StorageTransactionDb));
};

export async function createStoragePlace(db: StorageDb, rawInput: unknown) {
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
