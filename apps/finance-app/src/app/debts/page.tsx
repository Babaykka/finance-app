import { CalendarClock, HandCoins } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { formatMoney } from "@/domain/money";
import { getDebtTypeLabel, getFinanceViewData, getStatusLabel } from "@/server/ui/finance-view-data";

export const dynamic = "force-dynamic";

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

export default async function DebtsPage() {
  const data = await getFinanceViewData();

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

        {data.debts.length > 0 ? (
          <div className="item-list">
            {data.debts.map((debt) => (
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
