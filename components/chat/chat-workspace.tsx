"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useChatStore, GENERAL_CHANNEL_ID } from "@/lib/store/chat-store";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { MOCK_MESSAGES } from "@/lib/mock-messages";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useActiveProject } from "@/lib/supabase/use-active-project";
import { useSupabaseChatChannels } from "@/lib/supabase/hooks/use-supabase-chat-channels";
import { useProjectMembersWithStatus } from "@/lib/supabase/hooks/use-project-members";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { ChannelSidebar } from "./channel-sidebar";
import { ChatRoom } from "./chat-room";

export function ChatWorkspace({ deepLinkChannelId }: { deepLinkChannelId: string | null }) {
  const supabaseMode = isSupabaseConfigured();
  const currentUser = useCurrentUser();
  const { activeProject } = useActiveProject();
  const activeProjectId = supabaseMode ? (activeProject?.id ?? null) : null;

  // 두 데이터 소스 모두 항상 호출한다(Hooks 규칙) — 실제로 화면에 쓰이는 쪽만 아래에서 고른다.
  const mockChannels = useChatStore((state) => state.channels);
  const mockAddChannel = useChatStore((state) => state.addChannel);
  const mockRenameChannel = useChatStore((state) => state.renameChannel);
  const mockRemoveChannel = useChatStore((state) => state.removeChannel);

  const supabaseChannels = useSupabaseChatChannels(activeProjectId, currentUser.id);
  const projectMembersState = useProjectMembersWithStatus(activeProjectId);

  const channels = supabaseMode ? supabaseChannels.channels : mockChannels;

  const [activeChannelId, setActiveChannelId] = useState<string>(deepLinkChannelId ?? GENERAL_CHANNEL_ID);

  // 알림에서 /chat?channel=<id>로 들어오면 채널 목록이 들어온 뒤 그 채널을 열고 주소에서 지운다
  // (kanban의 ?task와 같은 방식). 이미 /chat에 있다가 들어와도 열리도록 effect로 맞춘다.
  const router = useRouter();
  useEffect(() => {
    if (!deepLinkChannelId) return;
    if (!channels.some((channel) => channel.id === deepLinkChannelId)) return;
    setActiveChannelId(deepLinkChannelId);
    router.replace("/chat", { scroll: false });
  }, [deepLinkChannelId, channels, router]);

  // 활성 채널이 보관되었거나 목록에 없으면(전환 직후 등) 첫 채널을 보여준다.
  const activeChannel = channels.find((channel) => channel.id === activeChannelId) ?? channels[0];

  async function handleAddChannel(name: string): Promise<boolean> {
    if (supabaseMode) {
      const channel = await supabaseChannels.addChannel(name);
      if (!channel) return false; // 실패/중복 — 활성 채널을 바꾸지 않는다
      setActiveChannelId(channel.id);
      return true;
    }
    mockAddChannel(name);
    return true;
  }

  function handleRenameChannel(channelId: string, name: string) {
    if (supabaseMode) supabaseChannels.renameChannel(channelId, name);
    else mockRenameChannel(channelId, name);
  }

  // 삭제 버튼은 항상 "보관"으로 연결한다 — 메시지 이력을 잃지 않기 위해서다.
  function handleArchiveChannel(channelId: string) {
    if (supabaseMode) supabaseChannels.archiveChannel(channelId);
    else mockRemoveChannel(channelId);

    if (channelId === activeChannelId) {
      const fallback = channels.find((channel) => channel.id !== channelId);
      setActiveChannelId(fallback?.id ?? GENERAL_CHANNEL_ID);
    }
  }

  const mockMessages = activeChannel?.id === GENERAL_CHANNEL_ID ? MOCK_MESSAGES : [];

  // 8rem = 앱 셸의 위 여백(pt-5) + TopBar(h-11) + 그 아래 간격(mb-8) + 아래 여백(pb-8).
  // 이보다 작게 빼면 문서가 넘쳐 페이지 전체가 스크롤된다.
  if (supabaseMode && !activeProjectId) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center rounded-xl border border-zinc-800 text-sm text-zinc-500">
        소속된 프로젝트가 없습니다. 프로젝트에 참여한 뒤 다시 확인해주세요.
      </div>
    );
  }

  return (
    <HydrationGate>
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-xl border border-zinc-800">
      <ChannelSidebar
        projectName={(supabaseMode ? activeProject?.name : null) ?? "SquadDesk 데모"}
        channels={channels}
        activeChannelId={activeChannel?.id ?? ""}
        isSupabaseMode={supabaseMode}
        error={supabaseMode ? supabaseChannels.error : null}
        isAddingChannel={supabaseMode ? supabaseChannels.isAddingChannel : false}
        onSelectChannel={setActiveChannelId}
        onAddChannel={handleAddChannel}
        onRenameChannel={handleRenameChannel}
        onArchiveChannel={handleArchiveChannel}
      />

      {activeChannel ? (
        <ChatRoom
          key={activeChannel.id}
          channelName={activeChannel.name}
          initialMessages={mockMessages}
          supabaseMode={supabaseMode}
          channelId={supabaseMode ? activeChannel.id : null}
          projectId={activeProjectId}
          projectMembers={projectMembersState.members}
          projectMembersLoading={projectMembersState.isLoading}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-zinc-600">
          {supabaseMode && supabaseChannels.isLoading
            ? "채널 목록을 불러오는 중입니다..."
            : "채널이 없습니다. 새 채널을 추가해보세요."}
        </div>
      )}
    </div>
    </HydrationGate>
  );
}
