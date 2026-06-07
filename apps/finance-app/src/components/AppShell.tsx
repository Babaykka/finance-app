import type { LucideIcon } from "lucide-react";
import { HandCoins, Landmark, Sparkles, WalletCards } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

type AppSection = "home" | "storage" | "debts" | "drafts";
type AppHref = "/" | "/storage" | "/debts" | "/drafts";

const navigation: Array<{ href: AppHref; label: string; section: AppSection; icon: LucideIcon }> = [
  { href: "/", label: "Главная", section: "home", icon: WalletCards },
  { href: "/storage", label: "Хранение", section: "storage", icon: Landmark },
  { href: "/debts", label: "Долги", section: "debts", icon: HandCoins },
  { href: "/drafts", label: "Черновики", section: "drafts", icon: Sparkles }
];

export function AppShell({
  active,
  children,
  title,
  subtitle
}: {
  active: AppSection;
  children: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brandmark" aria-hidden="true">
            <WalletCards size={21} strokeWidth={2.2} />
          </span>
          <span className="brandtext">
            <strong>Финансы</strong>
            <span>{subtitle ?? "личный контур"}</span>
          </span>
        </Link>
        <nav className="topnav" aria-label="Основная навигация">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = item.section === active;

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={isActive ? "topnav-item topnav-item-active" : "topnav-item"}
                href={item.href}
                key={item.href}
                title={item.label}
              >
                <Icon aria-hidden="true" size={17} strokeWidth={2.1} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="topbar-title">{title}</div>
      </header>

      <main className="content">{children}</main>

      <nav className="bottomnav" aria-label="Основная навигация">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = item.section === active;

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={isActive ? "navitem navitem-active" : "navitem"}
              href={item.href}
              key={item.href}
              title={item.label}
            >
              <Icon aria-hidden="true" size={21} strokeWidth={2.1} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
