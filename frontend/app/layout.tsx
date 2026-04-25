import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "ExoBrain",
  description: "あなたの外部脳 - AIチャットボット with 会話履歴",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${geist.variable} h-full`}>
      <body className="h-full flex antialiased font-sans">
        <Sidebar />
        <main className="flex-1 overflow-hidden">{children}</main>
      </body>
    </html>
  );
}
