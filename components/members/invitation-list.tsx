"use client";

import { Ban } from "lucide-react";
import type { ProjectInvitationListRow, ProjectInvitationStatus } from "@/lib/supabase/schema";
import { formatKoreanDate } from "@/lib/format";

/** 만료는 DB의 status가 아니라 expires_at으로 파생되므로 표시 전용 상태를 하나 더 둔다. */
type DisplayStatus = ProjectInvitationStatus | "expired";

const STATUS_BADGES: Record<DisplayStatus, { label: string; className: string }> = {
  pending: { label: "대기 중", className: "bg-amber-500/15 text-amber-400" },
  accepted: { label: "수락됨", className: "bg-emerald-500/15 text-emerald-400" },
  revoked: { label: "취소됨", className: "bg-zinc-700/60 text-zinc-400" },
  expired: { label: "만료됨", className: "bg-zinc-700/60 text-zinc-400" },
};

interface InvitationListProps {
  invitations: ProjectInvitationListRow[];
  onRevoke: (invitationId: string) => void;
}

export function InvitationList({ invitations, onRevoke }: InvitationListProps) {
  if (invitations.length === 0) {
    return <p className="py-6 text-center text-sm text-zinc-600">아직 보낸 초대가 없습니다.</p>;
  }

  return (
    <ul className="divide-y divide-zinc-800/60">
      {invitations.map((invitation) => {
        // 만료는 상태 컬럼이 아니라 expires_at으로 판정된다(SQL의 is_expired와 같은 기준).
        const status: DisplayStatus = invitation.is_expired ? "expired" : invitation.status;
        const badge = STATUS_BADGES[status];
        // 만료된 초대도 DB에서는 여전히 status='pending'이라 부분 유니크 인덱스를 점유한다.
        // 같은 이메일로 다시 초대하려면 먼저 취소해야 하므로 취소 버튼을 남겨둔다.
        const canRevoke = invitation.status === "pending";

        return (
          <li key={invitation.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-zinc-100">{invitation.email}</p>
              <p className="truncate text-xs text-zinc-500">
                {invitation.role} · {invitation.invited_by_name ?? "알 수 없음"} 초대 ·{" "}
                {status === "accepted" && invitation.accepted_at
                  ? `${formatKoreanDate(invitation.accepted_at)} 수락`
                  : `${formatKoreanDate(invitation.expires_at)} 만료`}
              </p>
            </div>

            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}>
              {badge.label}
            </span>

            {canRevoke && (
              <button
                type="button"
                onClick={() => onRevoke(invitation.id)}
                title="초대 취소"
                className="shrink-0 rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
              >
                <Ban className="h-4 w-4" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
