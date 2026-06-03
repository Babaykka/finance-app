import type { Source } from "@/domain/enums";
import type { AiAction } from "@/server/ai/schema";
import {
  createDebtWithOptionalPlan,
  recordDebtPayment
} from "@/server/services/debt-service";
import { createStoragePlace } from "@/server/services/storage-service";

type StorageServiceDb = Parameters<typeof createStoragePlace>[0];
type DebtServiceDb = Parameters<typeof createDebtWithOptionalPlan>[0];

export type ActionApplicationDb = Partial<StorageServiceDb> & Partial<DebtServiceDb>;
type TransactionCapableActionApplicationDb = ActionApplicationDb & {
  $transaction?<T>(fn: (tx: ActionApplicationDb) => Promise<T>): Promise<T>;
};

export type ApplyAiActionsInput = {
  ownerId: string;
  actor: string;
  source: Source;
  actions: AiAction[];
};

export type AppliedAiActionResult =
  | Awaited<ReturnType<typeof createStoragePlace>>
  | Awaited<ReturnType<typeof createDebtWithOptionalPlan>>
  | Awaited<ReturnType<typeof recordDebtPayment>>;

const dateOnlyToUtcDate = (dateOnly: string) => new Date(`${dateOnly}T00:00:00.000Z`);

const requireStorageDb = (db: ActionApplicationDb): StorageServiceDb => {
  if (!db.storagePlace || !db.auditLog) {
    throw new Error("Storage action application requires storagePlace and auditLog db delegates");
  }

  return db as StorageServiceDb;
};

const requireDebtDb = (db: ActionApplicationDb): DebtServiceDb => {
  if (!db.debt || !db.debtPayment || !db.auditLog) {
    throw new Error("Debt action application requires debt, debtPayment, and auditLog db delegates");
  }

  return db as DebtServiceDb;
};

const applyAiAction = (
  db: ActionApplicationDb,
  input: Omit<ApplyAiActionsInput, "actions">,
  action: AiAction
): Promise<AppliedAiActionResult> => {
  if (action.type === "create_storage_place") {
    return createStoragePlace(requireStorageDb(db), {
      ownerId: input.ownerId,
      actor: input.actor,
      source: input.source,
      name: action.name,
      type: action.storageType,
      subtype: action.subtype,
      holderContext: action.holderContext,
      asset: action.asset,
      amount: action.amount,
      amountKind: action.amountKind,
      availability: action.availability,
      ...(action.rate !== undefined ? { rate: action.rate } : {}),
      ...(action.interestPaymentDay !== undefined
        ? { interestPaymentDay: action.interestPaymentDay }
        : {}),
      status: action.storageType === "trusted_person" ? "check" : "active",
      attentionPriority: action.attentionPriority,
      ...(action.comment !== undefined ? { comment: action.comment } : {})
    });
  }

  if (action.type === "create_debt") {
    return createDebtWithOptionalPlan(requireDebtDb(db), {
      ownerId: input.ownerId,
      actor: input.actor,
      source: input.source,
      partyName: action.partyName,
      type: action.debtType,
      basis: action.basis,
      asset: action.asset,
      originalAmount: action.amount,
      status: action.status,
      ...(action.dueDate !== undefined
        ? {
            nextPaymentDate: dateOnlyToUtcDate(action.dueDate),
            nextPaymentAmount: action.nextPaymentAmount ?? action.amount
          }
        : {}),
      ...(action.dueDate === undefined && action.nextPaymentAmount !== undefined
        ? { nextPaymentAmount: action.nextPaymentAmount }
        : {}),
      attentionPriority: action.attentionPriority,
      ...(action.comment !== undefined ? { comment: action.comment } : {})
    });
  }

  if (!action.debtId) {
    throw new Error(
      "record_debt_payment requires debtId; disambiguate the debt before confirmation"
    );
  }

  return recordDebtPayment(requireDebtDb(db), {
    ownerId: input.ownerId,
    actor: input.actor,
    source: input.source,
    debtId: action.debtId,
    paymentDate: dateOnlyToUtcDate(action.paymentDate),
    amount: action.amount,
    asset: action.asset,
    ...(action.comment !== undefined ? { comment: action.comment } : {})
  });
};

export async function applyAiActions(
  db: TransactionCapableActionApplicationDb,
  input: ApplyAiActionsInput
): Promise<AppliedAiActionResult[]> {
  if (db.$transaction) {
    return db.$transaction((tx) => applyAiActions(tx, input));
  }

  const results: AppliedAiActionResult[] = [];

  for (const action of input.actions) {
    results.push(await applyAiAction(db, input, action));
  }

  return results;
}
