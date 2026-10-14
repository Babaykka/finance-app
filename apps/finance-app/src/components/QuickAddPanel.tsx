"use client";

import { Check, Landmark, LoaderCircle, Send, Sparkles, WalletCards, X } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";

type DraftResponse = {
  id: string;
  rawText?: string;
  confidence?: number;
  parsedActions?: {
    summary?: string;
  };
};

const getDraftSummary = (draft: DraftResponse) =>
  draft.parsedActions?.summary?.trim() || "Черновик создан";

const QUICK_TEMPLATES = [
  "долг: имя, сумма, срок, личный/работа",
  "у меня лежит сумма в месте хранения",
  "имя вернул сумму по долгу"
];

export function QuickAddPanel() {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "rejecting" | "saved" | "rejected">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    setSubmitting(true);
    setDraft(null);
    setDraftStatus("idle");
    setError(null);

    try {
      const response = await fetch("/api/parse-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, source: "web_text" })
      });

      if (!response.ok) {
        throw new Error(`parse-message failed with HTTP ${response.status}`);
      }

      setDraft((await response.json()) as DraftResponse);
      setText("");
    } catch {
      setError("Не удалось создать черновик");
    } finally {
      setSubmitting(false);
    }
  };

  const postDraftAction = async (action: "confirm" | "reject") => {
    if (!draft) {
      return;
    }

    setError(null);
    setDraftStatus(action === "confirm" ? "saving" : "rejecting");

    try {
      const response = await fetch(`/api/ai-drafts/${draft.id}/${action}`, { method: "POST" });
      if (!response.ok) {
        throw new Error(`draft ${action} failed with HTTP ${response.status}`);
      }

      setDraftStatus(action === "confirm" ? "saved" : "rejected");
    } catch {
      setDraftStatus("idle");
      setError("Не удалось обновить черновик");
    }
  };

  const isDraftBusy = draftStatus === "saving" || draftStatus === "rejecting";

  return (
    <section className="tool-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">AI-ввод</p>
          <h2>Быстро добавить</h2>
        </div>
        <Sparkles aria-hidden="true" size={22} />
      </div>

      <form className="quick-form" onSubmit={handleSubmit}>
        <textarea
          aria-label="Текст для AI-черновика"
          className="quick-input"
          onChange={(event) => setText(event.target.value)}
          placeholder="Контрагент Эпсилон вернул 10000 рублей"
          value={text}
        />
        <button className="primary-button" disabled={isSubmitting || text.trim().length === 0} type="submit">
          {isSubmitting ? (
            <LoaderCircle aria-hidden="true" className="spin" size={18} />
          ) : (
            <Send aria-hidden="true" size={18} />
          )}
          <span>Создать</span>
        </button>
      </form>

      <div className="suggestion-row" aria-label="Быстрые шаблоны">
        {QUICK_TEMPLATES.map((template) => (
          <button
            className="suggestion-chip"
            key={template}
            onClick={() => setText(template)}
            type="button"
          >
            {template}
          </button>
        ))}
      </div>

      {draft ? (
        <div className="quick-draft">
          <div className="item-main">
            <div>
              <p className="eyebrow">Черновик</p>
              <h3>{getDraftSummary(draft)}</h3>
            </div>
            <span className="pill">{Math.round((draft.confidence ?? 0.7) * 100)}%</span>
          </div>
          {draft.rawText ? <p className="item-note">{draft.rawText}</p> : null}
          {draftStatus === "saved" ? <div className="inline-state inline-success">Сохранено</div> : null}
          {draftStatus === "rejected" ? <div className="inline-state">Отклонено</div> : null}
          <div className="action-row">
            <button
              className="icon-action icon-action-primary"
              disabled={isDraftBusy || draftStatus === "saved" || draftStatus === "rejected"}
              onClick={() => postDraftAction("confirm")}
              type="button"
            >
              {draftStatus === "saving" ? (
                <LoaderCircle aria-hidden="true" className="spin" size={17} />
              ) : (
                <Check aria-hidden="true" size={17} />
              )}
              <span>Сохранить</span>
            </button>
            <button
              className="icon-action"
              disabled={isDraftBusy || draftStatus === "saved" || draftStatus === "rejected"}
              onClick={() => postDraftAction("reject")}
              type="button"
            >
              {draftStatus === "rejecting" ? (
                <LoaderCircle aria-hidden="true" className="spin" size={17} />
              ) : (
                <X aria-hidden="true" size={17} />
              )}
              <span>Отмена</span>
            </button>
            <Link className="icon-action" href="/drafts">
              Все черновики
            </Link>
          </div>
        </div>
      ) : null}
      {error ? <div className="inline-state inline-error">{error}</div> : null}

      <div className="quick-links">
        <Link className="tool-link" href="/debts">
          <WalletCards aria-hidden="true" size={18} />
          <span>Долг</span>
        </Link>
        <Link className="tool-link" href="/storage">
          <Landmark aria-hidden="true" size={18} />
          <span>Хранение</span>
        </Link>
      </div>
    </section>
  );
}
