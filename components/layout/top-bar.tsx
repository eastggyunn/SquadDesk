"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useActiveProject } from "@/lib/supabase/use-active-project";
import { useProjectMembers } from "@/lib/supabase/hooks/use-project-members";
import { useTasksStore } from "@/lib/store/tasks-store";
import { getAvatarColor } from "@/lib/avatar-color";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { NAV_ITEMS, isNavItemActive } from "./nav-items";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "./notification-bell";
import { useCurrentUser } from "@/components/providers/current-user-provider";

const MAX_AVATARS = 5;

/** 화면 맨 위 줄 — 왼쪽은 "프로젝트 / 현재 화면", 오른쪽은 테마 전환·알림·프로젝트 멤버 아바타 묶음. */
export function TopBar() {
  const pathname = usePathname();
  const supabaseMode = isSupabaseConfigured();
  const { activeProject } = useActiveProject();
  const currentUser = useCurrentUser();
  const remoteMembers = useProjectMembers(supabaseMode ? activeProject?.id ?? null : null);
  const mockTasks = useTasksStore((state) => state.tasks);
  // 멤버 목록은 localStorage에 저장된 작업에서 오므로 마운트 뒤에만 그린다(서버 렌더와 어긋나지 않게).
  const hasMounted = useHasMounted();

  // 로컬 데모에는 멤버 테이블이 없으므로 작업 담당자들을 멤버로 본다.
  const memberNames = useMemo(
    () =>
      supabaseMode
        ? remoteMembers.map((member) => member.name)
        : Array.from(new Set(mockTasks.map((task) => task.assignee.name))),
    [supabaseMode, remoteMembers, mockTasks]
  );

  const pageLabel = NAV_ITEMS.find((item) => isNavItemActive(item.href, pathname))?.label;
  const projectName = (supabaseMode ? activeProject?.name : null) ?? "SquadDesk 데모";
  const visible = hasMounted ? memberNames.slice(0, MAX_AVATARS) : [];
  const hiddenCount = hasMounted ? memberNames.length - visible.length : 0;

  return (
    <div className="mb-8 flex h-11 items-center justify-between gap-4 border-b border-zinc-800/60 pb-4">
      <p className="min-w-0 truncate text-sm text-zinc-500">
        {projectName}
        {pageLabel && (
          <>
            <span className="mx-1.5 text-zinc-700">/</span>
            <span className="font-medium text-zinc-200">{pageLabel}</span>
          </>
        )}
      </p>

      <div className="flex shrink-0 items-center gap-3">
        <ThemeToggle />
        {supabaseMode && currentUser.id && <NotificationBell userId={currentUser.id} />}
        {visible.length > 0 && (
          <div className="flex shrink-0 items-center" aria-label={`멤버 ${memberNames.length}명`}>
            {visible.map((name) => (
              // 아바타 색이 반투명이라 겹친 부분이 비치지 않도록 불투명 바탕을 한 겹 깐다.
              <span key={name} title={name} className="-ml-1.5 rounded-full bg-zinc-950 ring-2 ring-zinc-950 first:ml-0">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold ${getAvatarColor(name)}`}
                >
                  {name.slice(0, 1)}
                </span>
              </span>
            ))}
            {hiddenCount > 0 && (
              <span className="-ml-1.5 flex h-7 min-w-7 items-center justify-center rounded-full bg-zinc-800 px-1.5 text-[11px] font-semibold text-zinc-300 ring-2 ring-zinc-950">
                +{hiddenCount}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
