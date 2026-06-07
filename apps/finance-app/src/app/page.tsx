import { AlertTriangle, CircleDollarSign, HandCoins, WalletCards } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { DataUnavailable } from "@/components/DataUnavailable";
import { QuickAddPanel } from "@/components/QuickAddPanel";
import { StoragePlaceCard } from "@/components/StoragePlaceCard";
import { SummaryCard } from "@/components/SummaryCard";
import { formatMoney } from "@/domain/money";
import {
  getDebtTypeLabel,
  getFinanceViewData,
  getStatusLabel
} from "@/server/ui/finance-view-data";

export const dynamic = "force-dynamic";

const formatDate = (date: string | null) => {
  if (!date) {
    return "без даты";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short"
  }).format(new Date(`${date}T00:00:00.000Z`));
};

const getTotal = (data: Awaited<ReturnType<typeof getFinanceViewData>>, asset: "RUB" | "USDT") =>
  data.assetTotals.find((total) => total.asset === asset)?.amount ?? 0;

export default async function HomePage() {
  const data = await getFinanceViewData();
  const rubTotal = getTotal(data, "RUB");
  const usdtTotal = getTotal(data, "USDT");
  const debtRubTotal = data.debts
    .filter((debt) => debt.asset === "RUB")
    .reduce((sum, debt) => sum + debt.remainingAmount, 0);
  const attentionPlaces = data.storagePlaces.filter(
    (place) =>
      place.attentionPriority === "high" ||
      place.attentionPriority === "urgent" ||
      place.status === "check" ||
      place.type === "trusted_person"
  );

  return (
    <AppShell active="home" subtitle={data.ownerName} title="Обзор">
      <div className="stack">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Сводка</p>
            <h1>Обзор</h1>
          </div>
        </div>
        {data.isReady ? null : <DataUnavailable />}

        <section className="overview-grid" aria-label="Сводка">
          <SummaryCard
            icon={<WalletCards size={20} />}
            subtitle={`${data.storagePlaces.length} мест хранения`}
            title="RUB"
            tone="cash"
            value={formatMoney(rubTotal, "RUB")}
          />
          <SummaryCard
            icon={<CircleDollarSign size={20} />}
            subtitle="крипта и биржи"
            title="USDT"
            tone="crypto"
            value={formatMoney(usdtTotal, "USDT")}
          />
          <SummaryCard
            icon={<HandCoins size={20} />}
            subtitle={`${data.debts.length} открытых записей`}
            title="Долги"
            value={formatMoney(debtRubTotal, "RUB")}
          />
          <SummaryCard
            icon={<AlertTriangle size={20} />}
            subtitle={`${attentionPlaces.length} мест хранения`}
            title="Внимание"
            tone="warn"
            value={String(data.drafts.length)}
          />
        </section>

        <QuickAddPanel />

        <section>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Ближайшее</p>
              <h2>Долги и оплаты</h2>
            </div>
            <Link className="text-link" href="/debts">
              Все
            </Link>
          </div>
          {data.debts.length > 0 ? (
            <div className="item-list">
              {data.debts.slice(0, 4).map((debt) => (
                <article className="item-card" key={debt.id}>
                  <div className="item-main">
                    <div>
                      <p className="eyebrow">{getDebtTypeLabel(debt.type)}</p>
                      <h3>{debt.partyName}</h3>
                    </div>
                    <span className="amount">{formatMoney(debt.remainingAmount, debt.asset)}</span>
                  </div>
                  <div className="item-meta">
                    <span className="pill">{getStatusLabel(debt.status)}</span>
                    <span className="pill">{formatDate(debt.nextPaymentDate)}</span>
                  </div>
                  <p className="item-note">{debt.basis}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">Пока пусто</div>
          )}
        </section>

        <section>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Контроль</p>
              <h2>Хранение</h2>
            </div>
            <Link className="text-link" href="/storage">
              Все
            </Link>
          </div>
          {attentionPlaces.length > 0 ? (
            <div className="item-list">
              {attentionPlaces.slice(0, 4).map((place) => (
                <StoragePlaceCard key={place.id} place={place} />
              ))}
            </div>
          ) : (
            <div className="empty-state">Пока пусто</div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
