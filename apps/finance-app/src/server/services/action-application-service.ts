import type { PrismaClient } from "@prisma/client";
import type { Source } from "@/domain/enums";
import type { AiAction } from "@/server/ai/schema";
import {
  createDebtWithOptionalPlan,
  recordDebtPayment
} from "@/server/services/debt-service";
import {
  createStoragePlace,
  updateStoragePlace
} from "@/server/services/storage-service";

type StorageServiceDb = Parameters<typeof createStoragePlace>[0];
type StorageUpdateServiceDb = Parameters<typeof updateStoragePlace>[0];
type DebtServiceDb = Parameters<typeof createDebtWithOptionalPlan>[0];

export type ActionApplicationDb = {
  storagePlace?: Partial<
    Pick<PrismaClient["storagePlace"], "create" | "findFirstOrThrow" | "update">
  >;
  debt?: Partial<Pick<PrismaClient["debt"], "create" | "findFirstOrThrow" | "update">>;
  debtPayment?: Partial<Pick<PrismaClient["debtPayment"], "create">>;
  auditLog?: Partial<Pick<PrismaClient["auditLog"], "create">>;
};
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
  | Awaited<ReturnType<typeof updateStoragePlace>>
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

const requireStorageUpdateDb = (db: ActionApplicationDb): StorageUpdateServiceDb => {
  if (!db.storagePlace || !("findFirstOrThrow" in db.storagePlace) || !("update" in db.storagePlace) || !db.auditLog) {
    throw new Error(
      "Storage update action application requires storagePlace.findFirstOrThrow, storagePlace.update, and auditLog db delegates"
    );
  }

  return db as StorageUpdateServiceDb;
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

  if (action.type === "update_storage_place") {
    return updateStoragePlace(requireStorageUpdateDb(db), {
      ownerId: input.ownerId,
      actor: input.actor,
      source: input.source,
      ...(action.storagePlaceId !== undefined ? { storagePlaceId: action.storagePlaceId } : {}),
      ...(action.currentName !== undefined ? { currentName: action.currentName } : {}),
      ...(action.name !== undefined ? { name: action.name } : {}),
      ...(action.storageType !== undefined ? { type: action.storageType } : {}),
      ...(action.subtype !== undefined ? { subtype: action.subtype } : {}),
      ...(action.holderContext !== undefined ? { holderContext: action.holderContext } : {}),
      ...(action.asset !== undefined ? { asset: action.asset } : {}),
      ...(action.amount !== undefined ? { amount: action.amount } : {}),
      ...(action.amountKind !== undefined ? { amountKind: action.amountKind } : {}),
      ...(action.availability !== undefined ? { availability: action.availability } : {}),
      ...(action.rate !== undefined ? { rate: action.rate } : {}),
      ...(action.interestPaymentDay !== undefined
        ? { interestPaymentDay: action.interestPaymentDay }
        : {}),
      ...(action.status !== undefined ? { status: action.status } : {}),
      ...(action.attentionPriority !== undefined
        ? { attentionPriority: action.attentionPriority }
        : {}),
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
