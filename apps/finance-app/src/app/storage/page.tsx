import { Percent, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DataUnavailable } from "@/components/DataUnavailable";
import { SortControls } from "@/components/SortControls";
import { formatMoney } from "@/domain/money";
import {
  type StorageSort,
  getAvailabilityLabel,
  getFinanceViewData,
  getStatusLabel,
  getStorageTypeLabel,
  sortStoragePlacesForView
} from "@/server/ui/finance-view-data";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const STORAGE_SORT_OPTIONS: Array<{ value: StorageSort; label: string }> = [
  { value: "attention", label: "Важное" },
  { value: "amount_desc", label: "Сумма" },
  { value: "rate_desc", label: "Процент" },
  { value: "name_asc", label: "Имя" }
];

const normalizeStorageSort = (value: string | string[] | undefined): StorageSort => {
  const raw = Array.isArray(value) ? value[0] : value;

  return STORAGE_SORT_OPTIONS.some((option) => option.value === raw)
    ? (raw as StorageSort)
    : "attention";
};

export const formatStorageRate = (rate: number | null) => {
  if (rate === null) {
    return null;
  }

  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2
  }).format(rate)}%`;
};

export default async function StoragePage({ searchParams }: { searchParams?: SearchParams }) {
  const data = await getFinanceViewData();
  const sort = normalizeStorageSort((await searchParams)?.sort);
  const storagePlaces = sortStoragePlacesForView(data.storagePlaces, sort);

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
        {data.isReady ? null : <DataUnavailable />}

        <SortControls
          basePath="/storage"
          current={sort}
          defaultValue="attention"
          label="Сортировка мест хранения"
          options={STORAGE_SORT_OPTIONS}
        />

        {storagePlaces.length > 0 ? (
          <div className="item-list">
            {storagePlaces.map((place) => {
              const rate = formatStorageRate(place.rate);

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
