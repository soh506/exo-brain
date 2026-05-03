"use client";

import { createContext, useContext, useState, ReactNode } from "react";

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
  const [currentId, setCurrentId] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return new URLSearchParams(window.location.search).get("id") ?? undefined;
  });

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
