"use client";

import { useConversation } from "./conversation-context";
import ChatWindow from "@/components/ChatWindow";

export default function Home() {
  const { currentId } = useConversation();
  return <ChatWindow key={currentId ?? "new"} conversationId={currentId} />;
}
