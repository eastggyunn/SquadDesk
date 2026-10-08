"use client";

import { useState } from "react";
import { Info, ShieldCheck } from "lucide-react";
import type { ProjectMemberDetailRow, ProjectMemberRole } from "@/lib/supabase/schema";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useActiveProject } from "@/lib/supabase/use-active-project";
import { useProjectAccess } from "@/lib/supabase/hooks/use-project-access";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { DeleteConfirmModal } from "@/components/kanban/delete-confirm-modal";
import { ErrorAlert } from "@/components/ui/error-alert";
import { MemberList } from "./member-list";
import { InvitationList } from "./invitation-list";
import { InviteForm } from "./invite-form";
import { InviteLinkCallout } from "./invite-link-callout";

interface NewInvite {
  token: string;
  email: string;
}

export function MembersView() {
  const supabaseMode = isSupabaseConfigured();
  const currentUser = useCurrentUser();
  const { activeProject } = useActiveProject();

  const activeProjectId = supabaseMode ? (activeProject?.id ?? null) : null;
  const isOwner = activeProject?.role === "owner";

  const access = useProjectAccess(activeProjectId, isOwner);

  const [newInvite, setNewInvite] = useState<NewInvite | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<ProjectMemberDetailRow | null>(null);

  if (!supabaseMode) {
    return (
      <Notice>
        멤버 관리는 실제 Supabase 연결이 필요합니다. `.env.local`에 Supabase 환경 변수를 설정한 뒤 다시
        확인해주세요.
      </Notice>
    );
  }

  if (!activeProjectId) {
    return <Notice>소속된 프로젝트가 없습니다. 프로젝트 관리자에게 초대를 요청해주세요.</Notice>;
  }

  function handleRemoveConfirmed() {
    if (pendingRemoval) access.removeMember(pendingRemoval.user_id);
    setPendingRemoval(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <ErrorAlert message={access.error} />

      {!isOwner && (
        <div className="flex items-start gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
          <p className="text-sm text-zinc-400">
            읽기 전용입니다. 멤버 초대·역할 변경·제거는 프로젝트 owner만 할 수 있습니다.
          </p>
        </div>
      )}

      {isOwner && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <ShieldCheck className="h-4 w-4 text-cyan-400" />팀원 초대
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            초대 링크를 만들어 대상자에게 직접 전달하세요. 링크는 입력한 이메일 계정으로 로그인한 경우에만
            수락할 수 있고, 7일 뒤 만료됩니다.
          </p>

          <div className="mt-4">
            <InviteForm
              onInvite={access.invite}
              onInvited={(token, email) => setNewInvite({ token, email })}
            />
          </div>

          {newInvite && (
            <div className="mt-4">
              <InviteLinkCallout
                token={newInvite.token}
                email={newInvite.email}
                onClose={() => setNewInvite(null)}
              />
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-sm font-semibold text-zinc-200">
          멤버 <span className="ml-1 text-xs font-normal text-zinc-500">{access.members.length}명</span>
        </h2>

        <div className="mt-2">
          {access.isLoading ? (
            <p className="py-6 text-center text-sm text-zinc-600">불러오는 중입니다...</p>
          ) : (
            <MemberList
              members={access.members}
              isOwner={isOwner}
              currentUserId={currentUser.id}
              onChangeRole={(userId, role: ProjectMemberRole) => access.changeRole(userId, role)}
              onRemove={setPendingRemoval}
            />
          )}
        </div>
      </section>

      {isOwner && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="text-sm font-semibold text-zinc-200">보낸 초대</h2>
          <div className="mt-2">
            <InvitationList invitations={access.invitations} onRevoke={access.revokeInvitation} />
          </div>
        </section>
      )}

      <DeleteConfirmModal
        open={pendingRemoval !== null}
        description={`${pendingRemoval?.name ?? ""} 님을 프로젝트에서 제거하시겠습니까?`}
        helperText="작업·버그·메시지 이력은 그대로 남고, 프로젝트 접근 권한만 사라집니다."
        confirmLabel="제거"
        onCancel={() => setPendingRemoval(null)}
        onConfirm={handleRemoveConfirmed}
      />
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-10 text-center text-sm text-zinc-500">
      {children}
    </div>
  );
}
