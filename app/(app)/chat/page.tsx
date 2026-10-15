import { ChatWorkspace } from "@/components/chat/chat-workspace";

/** ?channel=<id> — 채팅 멘션 알림에서 들어올 때 열 채널. */
export default function ChatPage({ searchParams }: { searchParams: { channel?: string } }) {
  return <ChatWorkspace deepLinkChannelId={searchParams.channel ?? null} />;
}
