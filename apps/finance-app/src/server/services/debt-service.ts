import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  AssetSchema,
  AttentionPrioritySchema,
  DebtStatusSchema,
  DebtTypeSchema,
  SourceSchema
} from "@/domain/enums";
import { toAuditObject, writeAuditLog } from "./audit-service";

export const CreateDebtSchema = z.object({
  ownerId: z.string().min(1),
  actor: z.string().min(1),
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
  ownerId: z.string().min(1),
  actor: z.string().min(1),
  source: SourceSchema,
  debtId: z.string().min(1),
  paymentDate: z.date(),
  amount: z.number().positive(),
  asset: AssetSchema,
  comment: z.string().optional()
});

type CreateDebtData = Omit<z.infer<typeof CreateDebtSchema>, "actor" | "source"> & {
  remainingAmount: number;
};

type DebtTransactionDb = {
  debt: Pick<PrismaClient["debt"], "create" | "findFirstOrThrow" | "update">;
  debtPayment: Pick<PrismaClient["debtPayment"], "create">;
  auditLog: Pick<PrismaClient["auditLog"], "create">;
};

type DebtDb = DebtTransactionDb & Partial<Pick<PrismaClient, "$transaction">>;

const runInDebtTransaction = <T>(
  db: DebtDb,
  action: (tx: DebtTransactionDb) => Promise<T>
) => {
  if (!db.$transaction) {
    return action(db);
  }

  return db.$transaction((tx) => action(tx as DebtTransactionDb));
};

const toDecimal = (value: unknown) => new Prisma.Decimal(value as Prisma.Decimal.Value);

export async function createDebtWithOptionalPlan(db: DebtDb, rawInput: unknown) {
  const input = CreateDebtSchema.parse(rawInput);
  const { actor, source, ...debtFields } = input;
  const debtData: Prisma.DebtUncheckedCreateInput = {
    ...(debtFields satisfies Omit<CreateDebtData, "remainingAmount">),
    remainingAmount: input.originalAmount
  };

  return runInDebtTransaction(db, async (tx) => {
    const created = await tx.debt.create({ data: debtData });

    if (input.nextPaymentAmount !== undefined && input.nextPaymentDate !== undefined) {
      const plannedPaymentData: Prisma.DebtPaymentUncheckedCreateInput = {
        ownerId: input.ownerId,
        debtId: created.id,
        recordType: "planned",
        paymentDate: input.nextPaymentDate,
        amount: input.nextPaymentAmount,
        asset: input.asset,
        status: "expected",
        source,
        comment: input.comment
      };
      const plannedPayment = await tx.debtPayment.create({ data: plannedPaymentData });

      await writeAuditLog(tx, {
        ownerId: input.ownerId,
        actor,
        source,
        entityType: "DebtPayment",
        entityId: plannedPayment.id,
        newValues: toAuditObject(plannedPaymentData)
      });
    }

    await writeAuditLog(tx, {
      ownerId: input.ownerId,
      actor,
      source,
      entityType: "Debt",
      entityId: created.id,
      newValues: toAuditObject(debtData)
    });

    return created;
  });
}

export async function recordDebtPayment(db: DebtDb, rawInput: unknown) {
  const input = RecordPaymentSchema.parse(rawInput);
  return runInDebtTransaction(db, async (tx) => {
    const debt = await tx.debt.findFirstOrThrow({
      where: { id: input.debtId, ownerId: input.ownerId }
    });

    if (debt.asset !== input.asset) {
      throw new Error(`Payment asset ${input.asset} does not match debt asset ${debt.asset}`);
    }

    const currentRemaining = toDecimal(debt.remainingAmount);
    const paymentAmount = toDecimal(input.amount);

    if (paymentAmount.greaterThan(currentRemaining)) {
      throw new Error("Payment amount exceeds debt remaining amount");
    }

    const nextRemaining = currentRemaining.minus(paymentAmount);
    const nextStatus = nextRemaining.isZero() ? "closed" : debt.status;
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
    const payment = await tx.debtPayment.create({ data: paymentData });

    await tx.debt.update({
      where: { id: input.debtId },
      data: {
        remainingAmount: nextRemaining,
        ...(nextStatus !== debt.status ? { status: nextStatus } : {})
      }
    });

    await writeAuditLog(tx, {
      ownerId: input.ownerId,
      actor: input.actor,
      source: input.source,
      entityType: "DebtPayment",
      entityId: payment.id,
      oldValues: {
        debtRemainingAmount: currentRemaining.toString(),
        debtStatus: debt.status
      },
      newValues: toAuditObject({
        ...paymentData,
        debtRemainingAmount: nextRemaining.toString(),
        debtStatus: nextStatus
      })
    });

    return payment;
  });
}
