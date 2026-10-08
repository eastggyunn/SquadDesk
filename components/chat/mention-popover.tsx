"use client";

import type { RefObject } from "react";
import { AnchoredPopover } from "@/components/ui/anchored-popover";
import { getAvatarColor } from "@/lib/avatar-color";

/** 목업 모드(Supabase 미설정) 전용 더미 멤버. Supabase 모드에서는 절대 재사용하지 않는다. */
export const MOCK_TEAM_MEMBERS = ["김도윤", "박지훈", "이서연", "정하늘", "최민아", "오세훈"];

export interface MentionMember {
  id: string;
  name: string;
}

/** 목업 모드의 멘션 후보 — 데모에는 사용자 id가 없어 이름을 id로 쓴다. */
export const MOCK_MENTION_MEMBERS: MentionMember[] = MOCK_TEAM_MEMBERS.map((name) => ({ id: name, name }));

interface MentionPopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement>;
  onSelect: (name: string) => void;
  members: MentionMember[];
  isLoading?: boolean;
}

export function MentionPopover({ open, onClose, anchorRef, onSelect, members, isLoading }: MentionPopoverProps) {
  return (
    <AnchoredPopover open={open} onClose={onClose} anchorRef={anchorRef} placement="top" widthClassName="w-56">
      <p className="px-1 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        멤버 멘션
      </p>
      {isLoading ? (
        <p className="px-2 py-3 text-center text-xs text-zinc-500">멤버 목록을 불러오는 중입니다...</p>
      ) : members.length === 0 ? (
        <p className="px-2 py-3 text-center text-xs text-zinc-500">멘션할 멤버가 없습니다.</p>
      ) : (
        <ul className="space-y-0.5">
          {members.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                onClick={() => onSelect(member.name)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800"
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${getAvatarColor(
                    member.name
                  )}`}
                >
                  {member.name.slice(0, 1)}
                </span>
                {member.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </AnchoredPopover>
  );
}
