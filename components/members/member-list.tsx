"use client";

import { Trash2 } from "lucide-react";
import type { ProjectMemberDetailRow, ProjectMemberRole } from "@/lib/supabase/schema";
import { getAvatarColor } from "@/lib/avatar-color";
import { Select } from "@/components/ui/select";

export const ROLE_OPTIONS: { value: ProjectMemberRole; label: string }[] = [
  { value: "member", label: "member" },
  { value: "owner", label: "owner" },
];

interface MemberListProps {
  members: ProjectMemberDetailRow[];
  isOwner: boolean;
  currentUserId: string | null;
  onChangeRole: (userId: string, role: ProjectMemberRole) => void;
  onRemove: (member: ProjectMemberDetailRow) => void;
}

export function MemberList({ members, isOwner, currentUserId, onChangeRole, onRemove }: MemberListProps) {
  // 마지막 owner는 강등/제거할 수 없다(DB 트리거가 최종 방어선이고, 여기서는 미리 비활성화한다).
  const ownerCount = members.filter((member) => member.role === "owner").length;

  if (members.length === 0) {
    return <p className="py-6 text-center text-sm text-zinc-600">멤버가 없습니다.</p>;
  }

  return (
    <ul className="divide-y divide-zinc-800/60">
      {members.map((member) => {
        const isLastOwner = member.role === "owner" && ownerCount <= 1;

        return (
          <li key={member.user_id} className="flex flex-wrap items-center gap-3 py-3">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${getAvatarColor(
                member.name
              )}`}
            >
              {member.name.slice(0, 1)}
            </span>

            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm text-zinc-100">
                {member.name}
                {member.user_id === currentUserId && <span className="text-xs text-zinc-500">(나)</span>}
                {member.deactivated_at && (
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">비활성</span>
                )}
              </p>
              <p className="truncate text-xs text-zinc-500">{member.email ?? "이메일은 owner만 볼 수 있습니다"}</p>
            </div>

            {isOwner ? (
              <Select
                aria-label={`${member.name} 역할`}
                value={member.role}
                disabled={isLastOwner}
                onChange={(next) => onChangeRole(member.user_id, next as ProjectMemberRole)}
                title={isLastOwner ? "마지막 owner의 역할은 변경할 수 없습니다" : undefined}
                options={ROLE_OPTIONS}
                wrapperClassName="shrink-0"
                className="min-w-[6.5rem] rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100 focus:border-cyan-500 focus:outline-none"
              />
            ) : (
              <span className="rounded-full bg-zinc-800/60 px-2.5 py-1 text-xs text-zinc-400">{member.role}</span>
            )}

            {isOwner && (
              <button
                type="button"
                onClick={() => onRemove(member)}
                disabled={isLastOwner}
                title={isLastOwner ? "마지막 owner는 제거할 수 없습니다" : "프로젝트에서 제거"}
                className="shrink-0 rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
