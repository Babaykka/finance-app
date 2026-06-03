import { Prisma } from "@prisma/client";

type StorageSummaryRow = {
  asset: string;
  amount: unknown;
  type: string;
  status: string;
  attentionPriority: string;
  name: string;
};

type DebtSummaryRow = {
  partyName: string;
  remainingAmount: unknown;
  asset: string;
  status: string;
  nextPaymentDate?: Date | null;
};

type DraftSummaryRow = {
  id: string;
  status: string;
};

export type DashboardSummaryInput = {
  storagePlaces: StorageSummaryRow[];
  debts: DebtSummaryRow[];
  drafts: DraftSummaryRow[];
};

const toMoneyDecimal = (value: unknown, label: string) => {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim().length === 0)
  ) {
    throw new Error(`Invalid numeric amount for ${label}`);
  }

  try {
    const decimal = new Prisma.Decimal(value as Prisma.Decimal.Value);
    if (!decimal.isFinite()) {
      throw new Error("Amount must be finite");
    }
    return decimal;
  } catch (error) {
    throw new Error(`Invalid numeric amount for ${label}`, { cause: error });
  }
};

const toFiniteNumber = (value: Prisma.Decimal, label: string) => {
  const converted = Number(value.toString());
  if (!Number.isFinite(converted)) {
    throw new Error(`Invalid numeric amount for ${label}`);
  }
  return converted;
};

export function buildDashboardSummary(input: DashboardSummaryInput) {
  const assetTotals: Record<string, Prisma.Decimal> = {};

  for (const place of input.storagePlaces) {
    const amount = toMoneyDecimal(place.amount, place.name);
    assetTotals[place.asset] = (assetTotals[place.asset] ?? new Prisma.Decimal(0)).plus(amount);
  }

  const assets = Object.fromEntries(
    Object.entries(assetTotals).map(([asset, amount]) => [
      asset,
      toFiniteNumber(amount, asset)
    ])
  );

  return {
    assets,
    attentionStorage: input.storagePlaces.filter(
      (place) =>
        place.type === "trusted_person" ||
        place.status === "check" ||
        place.attentionPriority === "urgent"
    ),
    upcomingDebts: input.debts.filter((debt) => debt.status !== "closed"),
    pendingDraftCount: input.drafts.filter((draft) => draft.status === "pending").length
  };
}
