import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  AssetSchema,
  AttentionPrioritySchema,
  DebtStatusSchema,
  DebtTypeSchema,
  SourceSchema
} from "@/domain/enums";
import { writeAuditLog } from "./audit-service";

export const CreateDebtSchema = z.object({
  ownerId: z.string(),
  actor: z.string(),
  source: SourceSchema,
  partyName: z.string().min(1),
  type: DebtTypeSchema,
  basis: z.string().min(1),
  asset: AssetSchema,
  originalAmount: z.number().positive(),
  status: DebtStatusSchema,
  nextPaymentAmount: z.number().positive().optional(),
  nextPaymentDate: z.date().optional(),
  attentionPriority: AttentionPrioritySchema,
  comment: z.string().optional()
});

export const RecordPaymentSchema = z.object({
  ownerId: z.string(),
  actor: z.string(),
  source: SourceSchema,
  debtId: z.string(),
  paymentDate: z.date(),
  amount: z.number().positive(),
  asset: AssetSchema,
  comment: z.string().optional()
});

type DebtDb = {
  debt: Pick<PrismaClient["debt"], "create" | "findFirstOrThrow" | "update">;
  debtPayment: Pick<PrismaClient["debtPayment"], "create">;
  auditLog: Pick<PrismaClient["auditLog"], "create">;
};

type CreateDebtData = Omit<z.infer<typeof CreateDebtSchema>, "actor" | "source"> & {
  remainingAmount: number;
};

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

export async function createDebtWithOptionalPlan(db: DebtDb, rawInput: unknown) {
  const input = CreateDebtSchema.parse(rawInput);
  const { actor, source, ...debtFields } = input;
  const debtData: Prisma.DebtUncheckedCreateInput = {
    ...(debtFields satisfies Omit<CreateDebtData, "remainingAmount">),
    remainingAmount: input.originalAmount
  };
  const created = await db.debt.create({ data: debtData });

  if (input.nextPaymentAmount !== undefined && input.nextPaymentDate !== undefined) {
    await db.debtPayment.create({
      data: {
        ownerId: input.ownerId,
        debtId: created.id,
        recordType: "planned",
        paymentDate: input.nextPaymentDate,
        amount: input.nextPaymentAmount,
        asset: input.asset,
        status: "expected",
        source,
        comment: input.comment
      }
    });
  }

  await writeAuditLog(db, {
    ownerId: input.ownerId,
    actor,
    source,
    entityType: "Debt",
    entityId: created.id,
    newValues: toAuditObject(debtData)
  });

  return created;
}

export async function recordDebtPayment(db: DebtDb, rawInput: unknown) {
  const input = RecordPaymentSchema.parse(rawInput);
  const debt = await db.debt.findFirstOrThrow({
    where: { id: input.debtId, ownerId: input.ownerId }
  });

  if (debt.asset !== input.asset) {
    throw new Error(`Payment asset ${input.asset} does not match debt asset ${debt.asset}`);
  }

  const currentRemaining = Number(debt.remainingAmount);

  if (!Number.isFinite(currentRemaining)) {
    throw new Error("Debt remainingAmount must be numeric");
  }

  const nextRemaining = Math.max(0, currentRemaining - input.amount);
  const paymentData: Prisma.DebtPaymentUncheckedCreateInput = {
    ownerId: input.ownerId,
    debtId: input.debtId,
    recordType: "actual",
    paymentDate: input.paymentDate,
    amount: input.amount,
    asset: input.asset,
    status: "received",
    source: input.source,
    comment: input.comment
  };
  const payment = await db.debtPayment.create({ data: paymentData });

  await db.debt.update({
    where: { id: input.debtId },
    data: { remainingAmount: nextRemaining }
  });

  await writeAuditLog(db, {
    ownerId: input.ownerId,
    actor: input.actor,
    source: input.source,
    entityType: "DebtPayment",
    entityId: payment.id,
    oldValues: { debtRemainingAmount: currentRemaining },
    newValues: {
      debtRemainingAmount: nextRemaining,
      paymentAmount: input.amount
    }
  });

  return payment;
}
