import { CalendarDays, Percent } from "lucide-react";
import { formatMoney } from "@/domain/money";
import {
  getAvailabilityLabel,
  getStatusLabel,
  getStorageTypeLabel,
  type StoragePlaceView
} from "@/server/ui/finance-view-data";

export const formatStorageRate = (rate: number | null) =>
  `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2
  }).format(rate ?? 0)}%`;

export const formatStorageInterestPaymentDay = (
  rate: number | null,
  interestPaymentDay: number | null
) => {
  if (interestPaymentDay !== null) {
    return `${interestPaymentDay}-е число`;
  }

  return (rate ?? 0) > 0 ? "дата не указана" : "нет";
};

const getStorageStatusPillClass = (status: string) => {
  if (status === "check" || status === "move") {
    return "pill pill-warn";
  }

  return "pill";
};

export function StoragePlaceCard({ place }: { place: StoragePlaceView }) {
  const rate = place.rate ?? 0;
  const hasInterest = rate > 0;
  const note = [place.holderContext, place.comment].filter(Boolean).join(" · ");

  return (
    <article className="item-card storage-card">
      <div className="storage-card-top">
        <div className="storage-card-title">
          <p className="eyebrow">{getStorageTypeLabel(place.type, place.subtype)}</p>
          <h3>{place.name}</h3>
        </div>
        <span className="amount storage-amount">{formatMoney(place.amount, place.asset)}</span>
      </div>

      <div className="storage-facts" aria-label="Доходность и начисление">
        <div className={hasInterest ? "storage-fact storage-fact-positive" : "storage-fact"}>
          <span className="storage-fact-label">
            <Percent aria-hidden="true" size={13} />
            Процент
          </span>
          <strong>{formatStorageRate(place.rate)}</strong>
        </div>
        <div className="storage-fact">
          <span className="storage-fact-label">
            <CalendarDays aria-hidden="true" size={13} />
            Начисление
          </span>
          <strong>{formatStorageInterestPaymentDay(place.rate, place.interestPaymentDay)}</strong>
        </div>
      </div>

      <div className="item-meta storage-meta">
        <span className={getStorageStatusPillClass(place.status)}>
          {getStatusLabel(place.status)}
        </span>
        <span className="pill">{getAvailabilityLabel(place.availability)}</span>
        <span className="pill">{place.asset}</span>
      </div>

      <p className="item-note storage-note">{note}</p>
    </article>
  );
}
