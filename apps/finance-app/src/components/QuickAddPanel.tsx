"use client";

import { Landmark, LoaderCircle, Send, Sparkles, WalletCards } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";

type DraftResponse = {
  id: string;
  parsedActions?: {
    summary?: string;
  };
};

const getDraftSummary = (draft: DraftResponse) =>
  draft.parsedActions?.summary?.trim() || "Черновик создан";

export function QuickAddPanel() {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<DraftResponse | null>(null);
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
          placeholder="Геворг вернул 10000 рублей"
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

      {draft ? (
        <div className="inline-state inline-success">
          <span>{getDraftSummary(draft)}</span>
          <Link href="/drafts">Открыть</Link>
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
