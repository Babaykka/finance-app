"use client";

import { Check, LoaderCircle, Pencil, X } from "lucide-react";
import { useState } from "react";

export function DraftCard({
  id,
  summary,
  rawText,
  confidence
}: {
  id: string;
  summary: string;
  rawText: string;
  confidence: number;
}) {
  const [status, setStatus] = useState<"idle" | "saving" | "rejecting" | "saved" | "rejected">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  const postDraftAction = async (action: "confirm" | "reject") => {
    setError(null);
    setStatus(action === "confirm" ? "saving" : "rejecting");

    try {
      const response = await fetch(`/api/ai-drafts/${id}/${action}`, { method: "POST" });
      if (!response.ok) {
        throw new Error(`draft ${action} failed with HTTP ${response.status}`);
      }

      setStatus(action === "confirm" ? "saved" : "rejected");
    } catch {
      setStatus("idle");
      setError("Не удалось обновить черновик");
    }
  };

  const isBusy = status === "saving" || status === "rejecting";

  return (
    <article className="item-card draft-card">
      <div className="item-main">
        <div>
          <p className="eyebrow">Черновик</p>
          <h3>{summary}</h3>
        </div>
        <span className="pill">{Math.round(confidence * 100)}%</span>
      </div>
      <p className="item-note">{rawText}</p>

      {status === "saved" ? <div className="inline-state inline-success">Сохранено</div> : null}
      {status === "rejected" ? <div className="inline-state">Отклонено</div> : null}
      {error ? <div className="inline-state inline-error">{error}</div> : null}

      <div className="action-row">
        <button
          className="icon-action icon-action-primary"
          disabled={isBusy || status === "saved" || status === "rejected"}
          onClick={() => postDraftAction("confirm")}
          title="Сохранить"
          type="button"
        >
          {status === "saving" ? (
            <LoaderCircle aria-hidden="true" className="spin" size={17} />
          ) : (
            <Check aria-hidden="true" size={17} />
          )}
          <span>Сохранить</span>
        </button>
        <button
          className="icon-action"
          disabled
          title="Исправить"
          type="button"
        >
          <Pencil aria-hidden="true" size={17} />
          <span>Исправить</span>
        </button>
        <button
          className="icon-action"
          disabled={isBusy || status === "saved" || status === "rejected"}
          onClick={() => postDraftAction("reject")}
          title="Отмена"
          type="button"
        >
          {status === "rejecting" ? (
            <LoaderCircle aria-hidden="true" className="spin" size={17} />
          ) : (
            <X aria-hidden="true" size={17} />
          )}
          <span>Отмена</span>
        </button>
      </div>
    </article>
  );
}
