"use client";

import { useSearchParams } from "next/navigation";
import ChatWindow from "@/components/ChatWindow";

export default function ChatLoader() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? undefined;
  return <ChatWindow conversationId={id} />;
}
