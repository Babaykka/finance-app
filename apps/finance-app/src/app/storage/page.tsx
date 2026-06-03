import { Percent, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { formatMoney } from "@/domain/money";
import {
  getAvailabilityLabel,
  getFinanceViewData,
  getStatusLabel,
  getStorageTypeLabel
} from "@/server/ui/finance-view-data";

export const dynamic = "force-dynamic";

const formatRate = (rate: number | null) => {
  if (rate === null) {
    return null;
  }

  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
    style: "percent"
  }).format(rate);
};

export default async function StoragePage() {
  const data = await getFinanceViewData();

  return (
    <AppShell active="storage" subtitle={data.ownerName} title="Хранение">
      <div className="stack">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Баланс</p>
            <h1>Места хранения</h1>
          </div>
          <ShieldCheck aria-hidden="true" size={24} />
        </div>

        {data.storagePlaces.length > 0 ? (
          <div className="item-list">
            {data.storagePlaces.map((place) => {
              const rate = formatRate(place.rate);

              return (
                <article className="item-card" key={place.id}>
                  <div className="item-main">
                    <div>
                      <p className="eyebrow">{getStorageTypeLabel(place.type, place.subtype)}</p>
                      <h3>{place.name}</h3>
                    </div>
                    <span className="amount">{formatMoney(place.amount, place.asset)}</span>
                  </div>
                  <div className="item-meta">
                    <span className={place.status === "check" ? "pill pill-warn" : "pill"}>
                      {getStatusLabel(place.status)}
                    </span>
                    <span className="pill">{getAvailabilityLabel(place.availability)}</span>
                    {rate ? (
                      <span className="pill">
                        <Percent aria-hidden="true" size={13} />
                        {rate}
                      </span>
                    ) : null}
                    {place.interestPaymentDay ? (
                      <span className="pill">{place.interestPaymentDay} число</span>
                    ) : null}
                  </div>
                  <p className="item-note">{place.holderContext}</p>
                  {place.comment ? <p className="item-note">{place.comment}</p> : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">Пока пусто</div>
        )}
      </div>
    </AppShell>
  );
}
