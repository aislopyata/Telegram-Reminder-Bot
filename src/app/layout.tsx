import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Telegram Reminder Bot",
  description: "Production-ready Telegram reminder bot for Vercel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
