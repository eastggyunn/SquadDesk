"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, MailWarning, type LucideIcon } from "lucide-react";
import type { InvitationLookupStatus, ProjectInvitationLookupRow } from "@/lib/supabase/schema";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import * as membersRepo from "@/lib/supabase/repositories/project-members";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { useActiveProjectStore } from "@/lib/store/active-project-store";
import { primaryButton } from "@/components/ui/button-styles";

/**
 * 수락할 수 없는 상태별 안내. "ok"는 여기 없고 수락 버튼을 보여준다.
 * 아이콘까지 이 표에 담아, 상태가 늘어도 아이콘 분기를 따로 고치지 않게 한다.
 */
const BLOCKED_STATES: Record<
  Exclude<InvitationLookupStatus, "ok">,
  { title: string; detail: string; Icon: LucideIcon; iconClassName: string }
> = {
  not_found: {
    title: "초대를 찾을 수 없습니다",
    detail: "링크가 잘못되었거나 이미 삭제된 초대입니다. 초대한 분에게 새 링크를 요청해주세요.",
    Icon: AlertTriangle,
    iconClassName: "text-amber-400",
  },
  expired: {
    title: "만료된 초대입니다",
    detail: "이 초대 링크는 유효 기간이 지났습니다. 초대한 분에게 새 링크를 요청해주세요.",
    Icon: AlertTriangle,
    iconClassName: "text-amber-400",
  },
  revoked: {
    title: "취소된 초대입니다",
    detail: "이 초대는 프로젝트 owner가 취소했습니다. 초대한 분에게 문의해주세요.",
    Icon: AlertTriangle,
    iconClassName: "text-amber-400",
  },
  accepted: {
    title: "이미 수락된 초대입니다",
    detail: "이 초대 링크는 이미 사용되었습니다. 초대 링크는 한 번만 사용할 수 있습니다.",
    Icon: AlertTriangle,
    iconClassName: "text-amber-400",
  },
  email_mismatch: {
    title: "다른 계정으로 로그인되어 있습니다",
    detail:
      "이 초대는 다른 이메일 주소로 발송되었습니다. 초대받은 이메일 계정으로 로그아웃 후 다시 로그인해주세요.",
    Icon: MailWarning,
    iconClassName: "text-amber-400",
  },
  already_member: {
    title: "이미 이 프로젝트의 멤버입니다",
    detail: "추가로 수락할 필요가 없습니다. 바로 프로젝트를 이용하실 수 있습니다.",
    Icon: CheckCircle2,
    iconClassName: "text-emerald-400",
  },
  archived: {
    title: "보관된 프로젝트입니다",
    detail:
      "이 프로젝트는 보관되어 지금은 참여할 수 없습니다. owner가 프로젝트를 복원한 뒤 다시 시도해주세요. 초대 링크는 그대로 유효합니다.",
    Icon: AlertTriangle,
    iconClassName: "text-amber-400",
  },
};

export function InviteAcceptView({ token }: { token: string }) {
  const currentUser = useCurrentUser();
  const setActiveProjectId = useActiveProjectStore((state) => state.setActiveProjectId);

  const [invitation, setInvitation] = useState<ProjectInvitationLookupRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptedProject, setAcceptedProject] = useState<{ id: string; name: string } | null>(null);

  // 언마운트 후 응답이 도착해 setState하는 것을 막는다.
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const lookup = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await membersRepo.getProjectInvitation(getBrowserSupabaseClient(), token);
      if (isMounted.current) setInvitation(result);
    } catch (err) {
      if (isMounted.current) setError(err instanceof Error ? err.message : "초대 정보를 불러오지 못했습니다.");
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setIsLoading(false);
      return;
    }
    lookup();
  }, [lookup]);

  async function handleAccept() {
    setIsAccepting(true);
    setError(null);
    try {
      const result = await membersRepo.acceptProjectInvitation(getBrowserSupabaseClient(), token);
      if (!isMounted.current) return;

      if (result?.status === "ok" && result.project_id) {
        // 수락한 프로젝트를 바로 활성 프로젝트로 만들고 성공 화면을 보여준다.
        setActiveProjectId(result.project_id);
        setAcceptedProject({ id: result.project_id, name: result.project_name ?? "프로젝트" });
        return;
      }

      // 수락 사이에 상태가 바뀐 경우(만료/취소 등) — 수락 응답이 이미 최신 상태를
      // 담고 있으므로 다시 조회하지 않고 그대로 반영한다.
      setInvitation((prev) => ({
        status: result?.status ?? "not_found",
        project_id: result?.project_id ?? prev?.project_id ?? null,
        project_name: result?.project_name ?? prev?.project_name ?? null,
        invited_role: prev?.invited_role ?? null,
      }));
    } catch (err) {
      if (isMounted.current) setError(err instanceof Error ? err.message : "초대를 수락하지 못했습니다.");
    } finally {
      if (isMounted.current) setIsAccepting(false);
    }
  }

  if (!isSupabaseConfigured()) {
    return (
      <Panel icon={<AlertTriangle className="h-6 w-6 text-amber-400" />} title="Supabase가 설정되지 않았습니다">
        <p>초대 수락은 실제 Supabase 연결이 필요합니다. 관리자에게 문의해주세요.</p>
      </Panel>
    );
  }

  if (isLoading) {
    return (
      <Panel icon={<Loader2 className="h-6 w-6 animate-spin text-zinc-500" />} title="초대 정보를 확인하는 중입니다">
        <p>잠시만 기다려주세요.</p>
      </Panel>
    );
  }

  if (acceptedProject) {
    return (
      <Panel
        icon={<CheckCircle2 className="h-6 w-6 text-emerald-400" />}
        title={`${acceptedProject.name} 프로젝트에 참여했습니다`}
      >
        <p>이제 이 프로젝트의 작업·버그·채팅에 접근할 수 있습니다.</p>
        <Link
          href="/"
          className={`mt-4 ${primaryButton}`}
        >
          대시보드로 이동
        </Link>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel icon={<AlertTriangle className="h-6 w-6 text-red-400" />} title="오류가 발생했습니다">
        <p>{error}</p>
        <button
          type="button"
          onClick={lookup}
          className="mt-4 rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          다시 시도
        </button>
      </Panel>
    );
  }

  // 여기서 걸러내면 아래 성공 분기에서 invitation이 non-null로 좁혀진다.
  if (!invitation || invitation.status !== "ok") {
    const status = invitation && invitation.status !== "ok" ? invitation.status : "not_found";
    const { title, detail, Icon, iconClassName } = BLOCKED_STATES[status];

    return (
      <Panel icon={<Icon className={`h-6 w-6 ${iconClassName}`} />} title={title}>
        <p>{detail}</p>
        {status === "email_mismatch" && currentUser.email && (
          <p className="mt-2 text-xs text-zinc-500">현재 로그인: {currentUser.email}</p>
        )}
        <Link
          href="/"
          className="mt-4 inline-flex rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          대시보드로 이동
        </Link>
      </Panel>
    );
  }

  return (
    <Panel icon={<CheckCircle2 className="h-6 w-6 text-cyan-400" />} title={`${invitation.project_name} 초대`}>
      <p>
        <span className="font-medium text-zinc-200">{invitation.project_name}</span> 프로젝트에{" "}
        <span className="font-medium text-zinc-200">{invitation.invited_role}</span> 역할로 초대되었습니다.
      </p>
      {currentUser.email && <p className="mt-2 text-xs text-zinc-500">수락 계정: {currentUser.email}</p>}

      <button
        type="button"
        onClick={handleAccept}
        disabled={isAccepting}
        className={`mt-5 ${primaryButton}`}
      >
        {isAccepting ? "수락하는 중..." : "초대 수락"}
      </button>
    </Panel>
  );
}

function Panel({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-6 text-center backdrop-blur">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800/60">
        {icon}
      </span>
      <h1 className="mt-4 text-base font-semibold text-zinc-50">{title}</h1>
      <div className="mt-2 text-sm text-zinc-400">{children}</div>
    </div>
  );
}
