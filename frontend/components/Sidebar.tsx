"use client";

import { useEffect, useState, useRef } from "react";
import { Conversation, listConversations, deleteConversation, updateTitle } from "@/lib/api";
import { useConversation } from "@/app/conversation-context";

interface Props {
  onClose?: () => void;
}

export default function Sidebar({ onClose }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const { currentId, setCurrentId } = useConversation();

  useEffect(() => {
    listConversations()
      .then(setConversations)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handleNew = (e: Event) => {
      const { id, title } = (e as CustomEvent).detail;
      setConversations((prev) => {
        if (prev.some((c) => c.conversation_id === id)) return prev;
        return [
          { conversation_id: id, title: title || "無題", updated_at: new Date().toISOString(), message_count: 1 },
          ...prev,
        ];
      });
    };
    const handleSent = (e: Event) => {
      const { id } = (e as CustomEvent).detail;
      setConversations((prev) => {
        const target = prev.find((c) => c.conversation_id === id);
        if (!target) return prev;
        return [target, ...prev.filter((c) => c.conversation_id !== id)];
      });
    };
    window.addEventListener("exobrain:newConversation", handleNew);
    window.addEventListener("exobrain:messageSent", handleSent);
    return () => {
      window.removeEventListener("exobrain:newConversation", handleNew);
      window.removeEventListener("exobrain:messageSent", handleSent);
    };
  }, []);

  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  const handleNewChat = () => {
    setCurrentId(undefined);
    onClose?.();
  };

  const handleSelect = (id: string) => {
    setCurrentId(id);
    onClose?.();
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("この会話を削除しますか？")) return;
    await deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.conversation_id !== id));
    if (currentId === id) setCurrentId(undefined);
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
    <aside className="w-64 flex-shrink-0 bg-gray-900 text-white flex flex-col h-full">
      <div className="p-4 border-b border-gray-700">
        <button
          onClick={handleNewChat}
          className="w-full block text-center py-2 px-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
        >
          + 新しいチャット
        </button>
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
                  <button
                    onClick={() => handleSelect(conv.conversation_id)}
                    className={`w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-700 transition-colors text-left ${
                      currentId === conv.conversation_id ? "bg-gray-700" : ""
                    }`}
                  >
                    <span className="truncate flex-1 mr-1">{conv.title || "無題"}</span>
                    <span className="flex gap-1 flex-shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                      <span
                        onClick={(e) => startEditing(e, conv)}
                        className="text-gray-400 hover:text-white text-xs p-1 cursor-pointer"
                        aria-label="タイトルを編集"
                      >
                        ✎
                      </span>
                      <span
                        onClick={(e) => handleDelete(e, conv.conversation_id)}
                        className="text-gray-400 hover:text-red-400 text-xs p-1 cursor-pointer"
                        aria-label="削除"
                      >
                        ✕
                      </span>
                    </span>
                  </button>
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
