import { CalendarClock, HandCoins } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DataUnavailable } from "@/components/DataUnavailable";
import { SortControls } from "@/components/SortControls";
import { formatMoney } from "@/domain/money";
import {
  type DebtSort,
  getDebtTypeLabel,
  getFinanceViewData,
  getStatusLabel,
  sortDebtsForView
} from "@/server/ui/finance-view-data";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const DEBT_SORT_OPTIONS: Array<{ value: DebtSort; label: string }> = [
  { value: "due_asc", label: "Срок" },
  { value: "amount_desc", label: "Сумма" },
  { value: "attention", label: "Важное" },
  { value: "name_asc", label: "Имя" }
];

const normalizeDebtSort = (value: string | string[] | undefined): DebtSort => {
  const raw = Array.isArray(value) ? value[0] : value;

  return DEBT_SORT_OPTIONS.some((option) => option.value === raw) ? (raw as DebtSort) : "due_asc";
};

const formatDate = (date: string | null) => {
  if (!date) {
    return "без даты";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(new Date(`${date}T00:00:00.000Z`));
};

const getStatusClassName = (status: string) => {
  if (status === "overdue") {
    return "pill pill-danger";
  }

  if (status === "no_agreement" || status === "negotiating") {
    return "pill pill-warn";
  }

  return "pill";
};

export default async function DebtsPage({ searchParams }: { searchParams?: SearchParams }) {
  const data = await getFinanceViewData();
  const sort = normalizeDebtSort((await searchParams)?.sort);
  const debts = sortDebtsForView(data.debts, sort);

  return (
    <AppShell active="debts" subtitle={data.ownerName} title="Долги">
      <div className="stack">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Возвраты</p>
            <h1>Долги</h1>
          </div>
          <HandCoins aria-hidden="true" size={24} />
        </div>
        {data.isReady ? null : <DataUnavailable />}

        <SortControls
          basePath="/debts"
          current={sort}
          defaultValue="due_asc"
          label="Сортировка долгов"
          options={DEBT_SORT_OPTIONS}
        />

        {debts.length > 0 ? (
          <div className="item-list">
            {debts.map((debt) => (
              <article className="item-card" key={debt.id}>
                <div className="item-main">
                  <div>
                    <p className="eyebrow">{getDebtTypeLabel(debt.type)}</p>
                    <h3>{debt.partyName}</h3>
                  </div>
                  <span className="amount">{formatMoney(debt.remainingAmount, debt.asset)}</span>
                </div>
                <div className="item-meta">
                  <span className={getStatusClassName(debt.status)}>{getStatusLabel(debt.status)}</span>
                  <span className="pill">
                    <CalendarClock aria-hidden="true" size={13} />
                    {formatDate(debt.nextPaymentDate)}
                  </span>
                  {debt.nextPaymentAmount ? (
                    <span className="pill">{formatMoney(debt.nextPaymentAmount, debt.asset)}</span>
                  ) : null}
                </div>
                <p className="item-note">{debt.basis}</p>
                {debt.comment ? <p className="item-note">{debt.comment}</p> : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">Пока пусто</div>
        )}
      </div>
    </AppShell>
  );
}
