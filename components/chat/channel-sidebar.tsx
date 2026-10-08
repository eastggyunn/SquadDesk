"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Hash, Plus, Settings, Trash2 } from "lucide-react";
import type { ChatChannel } from "@/lib/store/chat-store";
import { DeleteConfirmModal } from "@/components/kanban/delete-confirm-modal";
import { primaryButtonSm } from "@/components/ui/button-styles";
import { SPRING } from "@/lib/motion";

interface ChannelSidebarProps {
  channels: ChatChannel[];
  activeChannelId: string;
  /** Supabase 실데이터 모드면 삭제 버튼이 "보관"으로 동작·안내된다(메시지 이력 보존). */
  isSupabaseMode: boolean;
  error?: string | null;
  /** 채널 추가 요청이 진행 중인 동안 입력창·생성 버튼을 비활성화한다(목업 모드는 항상 false). */
  isAddingChannel: boolean;
  onSelectChannel: (channelId: string) => void;
  /** 생성 성공(또는 이미 저장된 이름으로 reconcile) 여부를 반환한다 — 성공했을 때만 입력을 비우고 폼을 닫는다. */
  onAddChannel: (name: string) => Promise<boolean>;
  onRenameChannel: (channelId: string, name: string) => void;
  onArchiveChannel: (channelId: string) => void;
}


/** 채널 삭제 버튼은 Supabase 모드에서 보관(archive)으로 동작하므로, 되돌릴 수 있는 동작임을 알리는 문구·톤으로 확인 모달을 띄운다. */
const ARCHIVE_CONFIRM_COPY = {
  description: "이 채널을 보관하시겠습니까?",
  helperText: "보관된 채널은 목록에서 사라지지만 메시지 기록은 유지됩니다.",
  confirmLabel: "보관",
  tone: "neutral" as const,
};

export function ChannelSidebar({
  channels,
  activeChannelId,
  isSupabaseMode,
  error,
  isAddingChannel,
  onSelectChannel,
  onAddChannel,
  onRenameChannel,
  onArchiveChannel,
}: ChannelSidebarProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [editingChannel, setEditingChannel] = useState<{ id: string; name: string } | null>(null);
  const [deletingChannelId, setDeletingChannelId] = useState<string | null>(null);

  async function handleCreateChannel() {
    if (isAddingChannel) return; // 저장 중 재실행 방지 — 실제 중복 방지는 훅의 in-flight guard가 보장한다
    const trimmed = newChannelName.trim();
    if (!trimmed) return;
    const succeeded = await onAddChannel(trimmed);
    // 성공했을 때만 입력을 비우고 폼을 닫는다 — 중복/네트워크 실패면 입력값과 오류 문구(error prop)를
    // 그대로 유지해 사용자가 고쳐서 다시 시도할 수 있게 한다.
    if (succeeded) {
      setNewChannelName("");
      setIsAdding(false);
    }
  }

  function startEditing(channel: ChatChannel) {
    setEditingChannel({ id: channel.id, name: channel.name });
  }

  function commitEditing() {
    const trimmed = editingChannel?.name.trim();
    if (editingChannel && trimmed) {
      onRenameChannel(editingChannel.id, trimmed);
    }
    setEditingChannel(null);
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-800/60 bg-zinc-900/50">
      <div className="border-b border-zinc-800/60 px-4 py-4">
        <h2 className="truncate text-sm font-semibold text-zinc-50">SquadDesk</h2>
        <p className="text-xs text-zinc-500">팀 워크스페이스</p>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {error && (
          <p className="mx-2 mb-2 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-400">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between px-2 pb-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">채팅 채널</p>
          <button
            type="button"
            onClick={() => setIsAdding((prev) => !prev)}
            title="채널 추가"
            className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-cyan-400"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <AnimatePresence initial={false}>
          {isAdding && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={SPRING.collapse}
              className="overflow-hidden px-2"
            >
              <div className="mb-2 flex items-center gap-1.5">
                <input
                  autoFocus
                  value={newChannelName}
                  disabled={isAddingChannel}
                  aria-busy={isAddingChannel}
                  onChange={(event) => setNewChannelName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleCreateChannel();
                    }
                  }}
                  placeholder="새 채널 이름"
                  className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 transition-opacity duration-150 focus:border-cyan-500 focus:outline-none disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={handleCreateChannel}
                  disabled={isAddingChannel}
                  aria-busy={isAddingChannel}
                  className={`shrink-0 ${primaryButtonSm}`}
                >
                  {isAddingChannel ? "생성 중..." : "생성"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <nav className="space-y-0.5">
          {channels.map((channel) => {
            const isActive = channel.id === activeChannelId;
            const isEditing = editingChannel?.id === channel.id;

            if (isEditing) {
              return (
                <div key={channel.id} className="flex items-center gap-1 px-2 py-1">
                  <Hash className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                  <input
                    autoFocus
                    value={editingChannel.name}
                    onChange={(event) =>
                      setEditingChannel({ id: editingChannel.id, name: event.target.value })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitEditing();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setEditingChannel(null);
                      }
                    }}
                    onBlur={commitEditing}
                    className="w-full rounded-md border border-cyan-500/50 bg-zinc-950 px-2 py-1 text-sm text-zinc-100 focus:outline-none"
                  />
                </div>
              );
            }

            return (
              <div
                key={channel.id}
                className={`group flex items-center rounded-md pr-1 transition-colors ${
                  isActive ? "bg-cyan-500/15" : "hover:bg-zinc-800/60"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectChannel(channel.id)}
                  className={`flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-sm transition-colors ${
                    isActive ? "text-cyan-400" : "text-zinc-400 group-hover:text-zinc-200"
                  }`}
                >
                  <Hash className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{channel.name}</span>
                </button>

                <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                  <button
                    type="button"
                    onClick={() => startEditing(channel)}
                    title="채널 이름 수정"
                    className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingChannelId(channel.id)}
                    title={isSupabaseMode ? "채널 보관" : "채널 삭제"}
                    className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </nav>
      </div>

      <DeleteConfirmModal
        open={deletingChannelId !== null}
        itemLabel="이 채널"
        {...(isSupabaseMode ? ARCHIVE_CONFIRM_COPY : {})}
        onCancel={() => setDeletingChannelId(null)}
        onConfirm={() => {
          if (deletingChannelId) onArchiveChannel(deletingChannelId);
          setDeletingChannelId(null);
        }}
      />
    </aside>
  );
}
