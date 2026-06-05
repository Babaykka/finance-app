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
const CANONICAL_CASH_STORAGE_NAME = "Наличные";

type CreateStoragePlaceAction = Extract<AiAction, { type: "create_storage_place" }>;

const normalizeStorageActionForApplication = (action: CreateStoragePlaceAction) => {
  if (action.storageType !== "cash") {
    return action;
  }

  return {
    ...action,
    name: CANONICAL_CASH_STORAGE_NAME,
    holderContext: CANONICAL_CASH_STORAGE_NAME
  };
};

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
    const storageAction = normalizeStorageActionForApplication(action);

    return createStoragePlace(requireStorageDb(db), {
      ownerId: input.ownerId,
      actor: input.actor,
      source: input.source,
      name: storageAction.name,
      type: storageAction.storageType,
      subtype: storageAction.subtype,
      holderContext: storageAction.holderContext,
      asset: storageAction.asset,
      amount: storageAction.amount,
      amountKind: storageAction.amountKind,
      availability: storageAction.availability,
      ...(storageAction.rate !== undefined ? { rate: storageAction.rate } : {}),
      ...(storageAction.interestPaymentDay !== undefined
        ? { interestPaymentDay: storageAction.interestPaymentDay }
        : {}),
      status: storageAction.storageType === "trusted_person" ? "check" : "active",
      attentionPriority: storageAction.attentionPriority,
      ...(storageAction.comment !== undefined ? { comment: storageAction.comment } : {})
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
