"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Conversation, listConversations, deleteConversation } from "@/lib/api";

export default function Sidebar() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const load = async () => {
    try {
      const data = await listConversations();
      setConversations(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [pathname]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("この会話を削除しますか？")) return;
    await deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.conversation_id !== id));
    if (pathname === `/chat/${id}`) router.push("/chat/new");
  };

  const currentId = pathname.startsWith("/chat/") ? pathname.split("/")[2] : null;

  return (
    <aside className="w-64 flex-shrink-0 bg-gray-900 text-white flex flex-col h-screen">
      <div className="p-4 border-b border-gray-700">
        <Link
          href="/chat/new"
          className="w-full block text-center py-2 px-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
        >
          + 新しいチャット
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="text-gray-400 text-sm p-4">読み込み中...</p>
        ) : conversations.length === 0 ? (
          <p className="text-gray-400 text-sm p-4">会話履歴がありません</p>
        ) : (
          <ul className="py-2">
            {conversations.map((conv) => (
              <li key={conv.conversation_id} className="group">
                <Link
                  href={`/chat/${conv.conversation_id}`}
                  className={`flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-700 transition-colors ${
                    currentId === conv.conversation_id ? "bg-gray-700" : ""
                  }`}
                >
                  <span className="truncate flex-1 mr-2">{conv.title || "無題"}</span>
                  <button
                    onClick={(e) => handleDelete(e, conv.conversation_id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 text-xs flex-shrink-0"
                    aria-label="削除"
                  >
                    ✕
                  </button>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="p-4 border-t border-gray-700">
        <p className="text-xs text-gray-500 text-center">External Brain v0.1</p>
      </div>
    </aside>
  );
}
