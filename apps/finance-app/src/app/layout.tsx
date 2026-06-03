import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Финансы",
  description: "Личная финансовая система"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
