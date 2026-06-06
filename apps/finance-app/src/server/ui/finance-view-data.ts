import { Prisma } from "@prisma/client";
import type { Asset, AttentionPriority } from "@/domain/enums";

export type AssetTotalView = {
  asset: Asset;
  amount: number;
};

export type StoragePlaceView = {
  id: string;
  name: string;
  type: string;
  subtype: string;
  holderContext: string;
  asset: Asset;
  amount: number;
  amountKind: string;
  availability: string;
  rate: number | null;
  interestPaymentDay: number | null;
  status: string;
  attentionPriority: string;
  comment: string | null;
};

export type DebtView = {
  id: string;
  partyName: string;
  type: string;
  basis: string;
  asset: Asset;
  originalAmount: number;
  remainingAmount: number;
  status: string;
  nextPaymentAmount: number | null;
  nextPaymentDate: string | null;
  attentionPriority: string;
  comment: string | null;
};

export type DraftView = {
  id: string;
  source: string;
  rawText: string;
  summary: string;
  confidence: number;
  status: string;
  createdAt: string;
};

export type FinanceViewData = {
  isReady: boolean;
  ownerName: string;
  assetTotals: AssetTotalView[];
  storagePlaces: StoragePlaceView[];
  debts: DebtView[];
  drafts: DraftView[];
};

const ASSET_ORDER: Asset[] = ["RUB", "USDT", "AMD", "BTC", "ETH", "OTHER_CRYPTO"];
const ATTENTION_PRIORITY_RANK: Record<AttentionPriority, number> = {
  urgent: 3,
  high: 2,
  medium: 1,
  low: 0
};

const EMPTY_VIEW_DATA: FinanceViewData = {
  isReady: false,
  ownerName: "Hrach",
  assetTotals: [],
  storagePlaces: [],
  debts: [],
  drafts: []
};

const toNumber = (value: unknown) => Number(new Prisma.Decimal(value as Prisma.Decimal.Value));

const toAsset = (value: string): Asset => {
  if (ASSET_ORDER.includes(value as Asset)) {
    return value as Asset;
  }

  return "OTHER_CRYPTO";
};

const toIsoDate = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

const getDraftSummary = (parsedActions: unknown) => {
  if (
    typeof parsedActions === "object" &&
    parsedActions !== null &&
    "summary" in parsedActions &&
    typeof parsedActions.summary === "string" &&
    parsedActions.summary.trim().length > 0
  ) {
    return parsedActions.summary;
  }

  return "Проверь действие перед сохранением";
};

const sortAssetTotals = (totals: AssetTotalView[]) =>
  totals.sort((a, b) => ASSET_ORDER.indexOf(a.asset) - ASSET_ORDER.indexOf(b.asset));

const getAttentionRank = (priority: string) =>
  ATTENTION_PRIORITY_RANK[priority as AttentionPriority] ?? -1;

export type StorageSort = "attention" | "amount_desc" | "rate_desc" | "name_asc";
export type DebtSort = "due_asc" | "amount_desc" | "attention" | "name_asc";

const compareNullableDate = (left: string | null, right: string | null) => {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return left.localeCompare(right);
};

export const sortStoragePlacesForView = (
  places: StoragePlaceView[],
  sort: StorageSort = "attention"
) =>
  [...places].sort((left, right) => {
    if (sort === "amount_desc") {
      const amountDiff = right.amount - left.amount;

      if (amountDiff !== 0) {
        return amountDiff;
      }
    }

    if (sort === "rate_desc") {
      const leftRate = left.rate ?? -1;
      const rightRate = right.rate ?? -1;
      const rateDiff = rightRate - leftRate;

      if (rateDiff !== 0) {
        return rateDiff;
      }
    }

    if (sort === "name_asc") {
      return left.name.localeCompare(right.name, "ru");
    }

    const rankDiff = getAttentionRank(right.attentionPriority) - getAttentionRank(left.attentionPriority);

    if (rankDiff !== 0) {
      return rankDiff;
    }

    return left.name.localeCompare(right.name, "ru");
  });

export const sortDebtsForView = (debts: DebtView[], sort: DebtSort = "due_asc") =>
  [...debts].sort((left, right) => {
    if (sort === "amount_desc") {
      const amountDiff = right.remainingAmount - left.remainingAmount;

      if (amountDiff !== 0) {
        return amountDiff;
      }
    }

    if (sort === "attention") {
      const rankDiff = getAttentionRank(right.attentionPriority) - getAttentionRank(left.attentionPriority);

      if (rankDiff !== 0) {
        return rankDiff;
      }
    }

    if (sort === "name_asc") {
      return left.partyName.localeCompare(right.partyName, "ru");
    }

    const dateDiff = compareNullableDate(left.nextPaymentDate, right.nextPaymentDate);

    if (dateDiff !== 0) {
      return dateDiff;
    }

    return left.partyName.localeCompare(right.partyName, "ru");
  });

const isLocalViewSetupError = (error: unknown) =>
  error instanceof Error &&
  (error.message.includes("OWNER_TELEGRAM_USER_ID is required") ||
    error.message.includes("DATABASE_URL"));

export async function getFinanceViewData(): Promise<FinanceViewData> {
  try {
    const [{ getLocalOwner }, { prisma }] = await Promise.all([
      import("@/server/auth/local-owner"),
      import("@/server/db")
    ]);
    const owner = await getLocalOwner();
    const [storagePlaces, debts, drafts] = await prisma.$transaction([
      prisma.storagePlace.findMany({
        where: { ownerId: owner.id, status: { not: "closed" } },
        orderBy: [{ attentionPriority: "desc" }, { name: "asc" }]
      }),
      prisma.debt.findMany({
        where: { ownerId: owner.id, status: { not: "closed" } },
        orderBy: [{ nextPaymentDate: "asc" }, { partyName: "asc" }]
      }),
      prisma.aiDraft.findMany({
        where: { ownerId: owner.id, status: { in: ["pending", "needs_clarification"] } },
        orderBy: { createdAt: "desc" }
      })
    ]);

    const assetAmountByCode = new Map<Asset, number>();
    const storageView = storagePlaces.map((place) => {
      const asset = toAsset(place.asset);
      const amount = toNumber(place.amount);
      assetAmountByCode.set(asset, (assetAmountByCode.get(asset) ?? 0) + amount);

      return {
        id: place.id,
        name: place.name,
        type: place.type,
        subtype: place.subtype,
        holderContext: place.holderContext,
        asset,
        amount,
        amountKind: place.amountKind,
        availability: place.availability,
        rate: place.rate === null ? null : toNumber(place.rate),
        interestPaymentDay: place.interestPaymentDay,
        status: place.status,
        attentionPriority: place.attentionPriority,
        comment: place.comment
      };
    });

    const debtView = debts.map((debt) => ({
      id: debt.id,
      partyName: debt.partyName,
      type: debt.type,
      basis: debt.basis,
      asset: toAsset(debt.asset),
      originalAmount: toNumber(debt.originalAmount),
      remainingAmount: toNumber(debt.remainingAmount),
      status: debt.status,
      nextPaymentAmount: debt.nextPaymentAmount === null ? null : toNumber(debt.nextPaymentAmount),
      nextPaymentDate: toIsoDate(debt.nextPaymentDate),
      attentionPriority: debt.attentionPriority,
      comment: debt.comment
    }));

    return {
      isReady: true,
      ownerName: owner.displayName,
      assetTotals: sortAssetTotals(
        [...assetAmountByCode.entries()].map(([asset, amount]) => ({ asset, amount }))
      ),
      storagePlaces: sortStoragePlacesForView(storageView),
      debts: sortDebtsForView(debtView),
      drafts: drafts.map((draft) => ({
        id: draft.id,
        source: draft.source,
        rawText: draft.rawText,
        summary: getDraftSummary(draft.parsedActions),
        confidence: toNumber(draft.confidence),
        status: draft.status,
        createdAt: draft.createdAt.toISOString()
      }))
    };
  } catch (error) {
    if (isLocalViewSetupError(error)) {
      console.warn("Finance view data is unavailable:", error);
      return EMPTY_VIEW_DATA;
    }

    throw error;
  }
}

export function getStorageTypeLabel(type: string, subtype: string) {
  if (type === "income_bank_product" && subtype === "savings_account") {
    return "Накопительный счет";
  }

  if (type === "income_bank_product" && subtype === "deposit") {
    return "Вклад";
  }

  const labels: Record<string, string> = {
    bank_account: "Банковский счет",
    cash: "Наличные",
    crypto_exchange: "Криптобиржа",
    crypto_wallet: "Криптокошелек",
    trusted_person: "У знакомого",
    investment: "Инвестиции",
    other: "Другое"
  };

  return labels[type] ?? type;
}

export function getDebtTypeLabel(type: string) {
  return type === "work_receivable" ? "Работа" : "Личный долг";
}

export function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "Активно",
    check: "Проверить",
    move: "Переложить",
    closed: "Закрыто",
    no_agreement: "Без договоренности",
    negotiating: "Договориться",
    scheduled: "По графику",
    overdue: "Просрочено",
    pending: "Ожидает",
    needs_clarification: "Нужно уточнить"
  };

  return labels[status] ?? status;
}

export function getAvailabilityLabel(availability: string) {
  const labels: Record<string, string> = {
    immediate: "Сразу",
    delayed: "С задержкой",
    restricted: "Ограничено",
    locked_until_date: "До даты"
  };

  return labels[availability] ?? availability;
}
