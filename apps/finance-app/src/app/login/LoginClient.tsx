"use client";

import { useCallback, useEffect, useState } from "react";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready?: () => void;
        expand?: () => void;
      };
    };
  }
}

const getNextPath = () => {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
};

export function LoginClient() {
  const [status, setStatus] = useState("Проверяю Telegram...");
  const [isLoading, setIsLoading] = useState(true);

  const signInWithTelegram = useCallback(async () => {
    setIsLoading(true);
    setStatus("Проверяю Telegram...");

    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
      setIsLoading(false);
      setStatus("Открой приложение из Telegram Mini App, чтобы войти автоматически.");
      return;
    }

    const response = await fetch("/api/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData })
    });

    if (!response.ok) {
      setIsLoading(false);
      setStatus("Telegram не подтвердил доступ к этому приложению.");
      return;
    }

    window.location.assign(getNextPath());
  }, []);

  useEffect(() => {
    window.Telegram?.WebApp?.ready?.();
    window.Telegram?.WebApp?.expand?.();
    const timer = window.setTimeout(() => void signInWithTelegram(), 150);

    return () => window.clearTimeout(timer);
  }, [signInWithTelegram]);

  return (
    <main className="login-screen">
      <section className="login-panel" aria-labelledby="login-title">
        <p className="eyebrow">Закрытый доступ</p>
        <h1 id="login-title">Финансы</h1>
        <p className="login-copy">
          Вход открыт только через Telegram Mini App для разрешенного Telegram аккаунта.
        </p>
        <div className="login-status" role="status">
          {status}
        </div>
        <button className="primary-button" disabled={isLoading} onClick={signInWithTelegram}>
          {isLoading ? "Проверяю..." : "Повторить вход"}
        </button>
      </section>
    </main>
  );
}
