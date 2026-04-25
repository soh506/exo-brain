"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface ConversationContextType {
  currentId: string | undefined;
  setCurrentId: (id: string | undefined) => void;
}

const ConversationContext = createContext<ConversationContextType>({
  currentId: undefined,
  setCurrentId: () => {},
});

export function useConversation() {
  return useContext(ConversationContext);
}

export function ConversationProvider({ children }: { children: ReactNode }) {
  const [currentId, setCurrentId] = useState<string | undefined>(undefined);

  // ページ読み込み時にURLから初期IDを取得
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (id) setCurrentId(id);
  }, []);

  const handleSetCurrentId = (id: string | undefined) => {
    setCurrentId(id);
    // URLバーを更新（Next.jsルーティングはトリガーしない）
    const url = id ? `/?id=${id}` : "/";
    window.history.replaceState({}, "", url);
  };

  return (
    <ConversationContext.Provider value={{ currentId, setCurrentId: handleSetCurrentId }}>
      {children}
    </ConversationContext.Provider>
  );
}
