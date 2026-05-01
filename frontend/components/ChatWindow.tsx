"use client";

import { useState, useRef, useEffect } from "react";
import { Message, sendMessage, getConversation } from "@/lib/api";
import { useConversation } from "@/app/conversation-context";

interface Props {
  conversationId?: string;
}

export default function ChatWindow({ conversationId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [currentConvId, setCurrentConvId] = useState(conversationId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Chrome: compositionend → keydown の順。確定直後のkeydownをブロックするフラグ。
  const compositionJustEndedRef = useRef(false);
  // Safari: keydown → compositionend の順。keydownで既に処理済みかを記録するフラグ。
  const compositionEndHandledRef = useRef(false);
  const { setCurrentId } = useConversation();

  // マウント時のみ実行（keyが変わるとリマウントされる）
  useEffect(() => {
    if (!conversationId) return;
    setFetching(true);
    getConversation(conversationId)
      .then((conv) => setMessages(conv.messages ?? []))
      .catch(() => setMessages([]))
      .finally(() => setFetching(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!loading && !fetching) {
      textareaRef.current?.focus();
    }
  }, [loading, fetching]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: Message = {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await sendMessage(text, currentConvId);
      const assistantMessage: Message = {
        role: "assistant",
        content: res.message,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      if (!currentConvId) {
        const newId = res.conversation_id;
        setCurrentConvId(newId);
        // コンテキスト経由で更新（URLバーも更新される）
        setCurrentId(newId);
        // サイドバーに通知
        window.dispatchEvent(
          new CustomEvent("exobrain:newConversation", {
            detail: { id: newId, title: text.substring(0, 50) },
          })
        );
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "エラーが発生しました。もう一度お試しください。",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (e.nativeEvent.isComposing) {
        // Safari: keydownがcompositionendより先に発火。次のcompositionendでフラグを立てない。
        compositionEndHandledRef.current = true;
        return;
      }
      if (compositionJustEndedRef.current) {
        // Chrome: compositionendがkeydownより先に発火。この1回だけブロック。
        compositionJustEndedRef.current = false;
        return;
      }
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {fetching ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 text-sm animate-pulse">読み込み中...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-400">
              <p className="text-2xl mb-2">🧠</p>
              <p className="text-lg font-medium">ExoBrain</p>
              <p className="text-sm mt-1">何でも聞いてください</p>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-2xl px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-gray-100 text-gray-800 rounded-bl-sm"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-500 px-4 py-3 rounded-2xl rounded-bl-sm text-sm">
              <span className="animate-pulse">考え中...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-gray-200 p-4">
        <form onSubmit={handleSubmit} className="flex gap-2 max-w-3xl mx-auto">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onCompositionStart={(e) => {
              console.log("[IME] compositionstart", { data: e.data, justEnded: compositionJustEndedRef.current });
              compositionEndHandledRef.current = false;
            }}
            onCompositionEnd={(e) => {
              console.log("[IME] compositionend", { data: e.data, handledByKey: compositionEndHandledRef.current });
              if (!compositionEndHandledRef.current) {
                compositionJustEndedRef.current = true;
              }
              compositionEndHandledRef.current = false;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                console.log("[IME] keydown Enter", { isComposing: e.nativeEvent.isComposing, justEnded: compositionJustEndedRef.current });
              }
              handleKeyDown(e);
            }}
            placeholder="メッセージを入力（Enter で送信、Shift+Enter で改行）"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            style={{ maxHeight: "120px", overflowY: "auto" }}
            disabled={loading || fetching}
          />
          <button
            type="submit"
            disabled={loading || fetching || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            送信
          </button>
        </form>
      </div>
    </div>
  );
}
