import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Suspense } from "react";
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
        <Suspense fallback={<div className="w-64 flex-shrink-0 bg-gray-900" />}>
          <Sidebar />
        </Suspense>
        <main className="flex-1 overflow-hidden">{children}</main>
      </body>
    </html>
  );
}
