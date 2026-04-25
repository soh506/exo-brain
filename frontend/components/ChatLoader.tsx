"use client";

import { useSearchParams } from "next/navigation";
import ChatWindow from "@/components/ChatWindow";

export default function ChatLoader() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? undefined;
  // keyが変わるとChatWindowが完全にリセットされる
  return <ChatWindow key={id ?? "new"} conversationId={id} />;
}
