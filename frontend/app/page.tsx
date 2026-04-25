"use client";

import { Suspense } from "react";
import ChatWindow from "@/components/ChatWindow";
import ChatLoader from "@/components/ChatLoader";

export default function Home() {
  return (
    <Suspense fallback={<ChatWindow />}>
      <ChatLoader />
    </Suspense>
  );
}
