import { getConversation } from "@/lib/api";
import ChatWindow from "@/components/ChatWindow";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ChatPage({ params }: Props) {
  const { id } = await params;
  const conversation = await getConversation(id).catch(() => null);

  return (
    <ChatWindow
      conversationId={id}
      initialMessages={conversation?.messages ?? []}
    />
  );
}
