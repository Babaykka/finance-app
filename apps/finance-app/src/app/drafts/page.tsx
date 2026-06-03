import { Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DraftCard } from "@/components/DraftCard";
import { getFinanceViewData } from "@/server/ui/finance-view-data";

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  const data = await getFinanceViewData();

  return (
    <AppShell active="drafts" subtitle={data.ownerName} title="Черновики">
      <div className="stack">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Проверка</p>
            <h1>Черновики</h1>
          </div>
          <Sparkles aria-hidden="true" size={24} />
        </div>

        {data.drafts.length > 0 ? (
          <div className="item-list">
            {data.drafts.map((draft) => (
              <DraftCard
                confidence={draft.confidence}
                id={draft.id}
                key={draft.id}
                rawText={draft.rawText}
                summary={draft.summary}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">Пока пусто</div>
        )}
      </div>
    </AppShell>
  );
}
