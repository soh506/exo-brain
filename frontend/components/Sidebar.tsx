"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Conversation, listConversations, deleteConversation, updateTitle, getConversation } from "@/lib/api";

export default function Sidebar() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentId = searchParams.get("id");

  // 初回のみ全件取得
  useEffect(() => {
    listConversations()
      .then(setConversations)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // currentIdが変わったとき、未知のIDなら会話を追加する（新規会話作成後）
  useEffect(() => {
    if (!currentId) return;
    const exists = conversations.some((c) => c.conversation_id === currentId);
    if (exists) return;

    getConversation(currentId)
      .then((conv) => {
        setConversations((prev) => [
          {
            conversation_id: conv.conversation_id,
            title: conv.title || "無題",
            updated_at: conv.updated_at,
            message_count: (conv.messages ?? []).length,
          },
          ...prev,
        ]);
      })
      .catch(console.error);
  }, [currentId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("この会話を削除しますか？")) return;
    await deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.conversation_id !== id));
    if (currentId === id) router.push("/");
  };

  const startEditing = (e: React.MouseEvent, conv: Conversation) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(conv.conversation_id);
    setEditingTitle(conv.title || "");
  };

  const commitEdit = async (id: string) => {
    const title = editingTitle.trim();
    setEditingId(null);
    if (!title) return;
    setConversations((prev) =>
      prev.map((c) => (c.conversation_id === id ? { ...c, title } : c))
    );
    await updateTitle(id, title).catch(console.error);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter") commitEdit(id);
    if (e.key === "Escape") setEditingId(null);
  };

  return (
    <aside className="w-64 flex-shrink-0 bg-gray-900 text-white flex flex-col h-screen">
      <div className="p-4 border-b border-gray-700">
        <Link
          href="/"
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
                {editingId === conv.conversation_id ? (
                  <div className="px-4 py-2">
                    <input
                      ref={editInputRef}
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => commitEdit(conv.conversation_id)}
                      onKeyDown={(e) => handleEditKeyDown(e, conv.conversation_id)}
                      className="w-full bg-gray-700 text-white text-sm px-2 py-1 rounded outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                ) : (
                  <Link
                    href={`/?id=${conv.conversation_id}`}
                    className={`flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-700 transition-colors ${
                      currentId === conv.conversation_id ? "bg-gray-700" : ""
                    }`}
                  >
                    <span className="truncate flex-1 mr-1">{conv.title || "無題"}</span>
                    <span className="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={(e) => startEditing(e, conv)}
                        className="text-gray-400 hover:text-white text-xs"
                        aria-label="タイトルを編集"
                      >
                        ✎
                      </button>
                      <button
                        onClick={(e) => handleDelete(e, conv.conversation_id)}
                        className="text-gray-400 hover:text-red-400 text-xs"
                        aria-label="削除"
                      >
                        ✕
                      </button>
                    </span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="p-4 border-t border-gray-700">
        <p className="text-xs text-gray-500 text-center">ExoBrain v0.1</p>
      </div>
    </aside>
  );
}
