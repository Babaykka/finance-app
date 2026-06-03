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

export function buildDashboardSummary(input: DashboardSummaryInput) {
  const assets: Record<string, number> = {};

  for (const place of input.storagePlaces) {
    assets[place.asset] = (assets[place.asset] ?? 0) + Number(place.amount);
  }

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
