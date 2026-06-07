import { ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DataUnavailable } from "@/components/DataUnavailable";
import { SortControls } from "@/components/SortControls";
import { StoragePlaceCard } from "@/components/StoragePlaceCard";
import {
  type StorageSort,
  getFinanceViewData,
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
            {storagePlaces.map((place) => (
              <StoragePlaceCard key={place.id} place={place} />
            ))}
          </div>
        ) : (
          <div className="empty-state">Пока пусто</div>
        )}
      </div>
    </AppShell>
  );
}
