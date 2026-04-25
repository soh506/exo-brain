"use client";

import { useState, Suspense } from "react";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex overflow-hidden" style={{ height: "100dvh" }}>
      {/* モバイル：背景オーバーレイ */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* サイドバー：モバイルはスライドイン、デスクトップは常時表示 */}
      <div
        className={`fixed md:static inset-y-0 left-0 z-30 w-64 transform transition-transform duration-200 ease-in-out md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Suspense fallback={<div className="w-64 h-full bg-gray-900" />}>
          <Sidebar onClose={() => setOpen(false)} />
        </Suspense>
      </div>

      {/* メインコンテンツ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* モバイル用ヘッダー */}
        <div className="md:hidden flex items-center px-3 py-2 border-b border-gray-200 bg-white flex-shrink-0">
          <button
            onClick={() => setOpen(true)}
            className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100"
            aria-label="メニューを開く"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="ml-3 font-medium text-gray-800 text-sm">ExoBrain</span>
        </div>

        <div className="flex-1 overflow-hidden min-h-0">
          {children}
        </div>
      </div>
    </div>
  );
}
