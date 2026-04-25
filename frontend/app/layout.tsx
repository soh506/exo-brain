import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "ExoBrain",
  description: "あなたの外部脳 - AIチャットボット with 会話履歴",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${geist.variable}`}>
      <body className="antialiased font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
