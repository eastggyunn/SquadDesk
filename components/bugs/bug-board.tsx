"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { Bug, BugStatus } from "@/lib/types";
import { useBugsStore } from "@/lib/store/bugs-store";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useActiveProject } from "@/lib/supabase/use-active-project";
import { useSupabaseBugs } from "@/lib/supabase/hooks/use-supabase-bugs";
import { useSupabaseTasks } from "@/lib/supabase/hooks/use-supabase-tasks";
import { useBugFormActions } from "@/lib/hooks/use-bug-form-actions";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { DeleteConfirmModal } from "@/components/kanban/delete-confirm-modal";
import { BugTable } from "./bug-table";
import { BugToolbar, type SeverityFilter, type StatusFilter } from "./bug-toolbar";
import { BugFormDrawer } from "./bug-form-drawer";
import { SEVERITY_ORDER } from "./severity-badge";
import { primaryButton } from "@/components/ui/button-styles";
import { PageHeader } from "@/components/layout/page-header";
import { surfaceLayoutId } from "@/lib/motion";

interface FormState {
  mode: "create" | "edit";
  bug?: Bug;
}

export function BugBoard() {
  const supabaseMode = isSupabaseConfigured();
  const currentUser = useCurrentUser();
  const { activeProject } = useActiveProject();
  const activeProjectId = supabaseMode ? (activeProject?.id ?? null) : null;

  // 두 데이터 소스 모두 항상 호출한다(Hooks 규칙) — 실제로 화면에 쓰이는 쪽만 아래에서 고른다.
  const mockBugs = useBugsStore((state) => state.bugs);
  const mockAddBug = useBugsStore((state) => state.addBug);
  const mockUpdateBug = useBugsStore((state) => state.updateBug);
  const mockDeleteBug = useBugsStore((state) => state.deleteBug);
  const mockSetBugStatus = useBugsStore((state) => state.setBugStatus);

  const supabaseBugs = useSupabaseBugs(activeProjectId, currentUser.id);
  // 버그를 특정 작업에 연결하는 select용 — 같은 활성 프로젝트의 작업 목록만 필요하므로 조회 훅을 그대로 재사용한다.
  const supabaseTasksForLink = useSupabaseTasks(activeProjectId, null);

  const bugs = supabaseMode ? supabaseBugs.bugs : mockBugs;
  const taskOptions = supabaseMode
    ? supabaseTasksForLink.tasks.map((task) => ({ id: task.id, title: task.title }))
    : undefined;

  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [hideResolved, setHideResolved] = useState(false);
  const [formState, setFormState] = useState<FormState | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const { handleFormSubmit, handleDeleteConfirmed } = useBugFormActions({
    supabaseMode,
    formState,
    setFormState,
    setIsDeleteConfirmOpen,
    currentUserAssignee: currentUser.assignee,
    supabaseAddBug: supabaseBugs.addBug,
    supabaseUpdateBug: supabaseBugs.updateBug,
    supabaseDeleteBug: supabaseBugs.deleteBug,
    mockAddBug,
    mockUpdateBug,
    mockDeleteBug,
  });

  function handleToggleStatus(bug: Bug) {
    const nextStatus: BugStatus = bug.status === "Resolved" ? "Open" : "Resolved";
    if (supabaseMode) supabaseBugs.setBugStatus(bug.id, nextStatus);
    else mockSetBugStatus(bug.id, nextStatus);
  }

  const visibleBugs = bugs
    .filter((bug) => {
      const query = search.trim().toLowerCase();
      if (!query) return true;
      return bug.title.toLowerCase().includes(query) || bug.location.toLowerCase().includes(query);
    })
    .filter((bug) => severityFilter === "ALL" || bug.severity === severityFilter)
    .filter((bug) => statusFilter === "ALL" || bug.status === statusFilter)
    .filter((bug) => !hideResolved || bug.status !== "Resolved")
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const blockerCount = bugs.filter(
    (bug) => bug.severity === "Blocker" && bug.status === "Open"
  ).length;

  return (
    <HydrationGate>
    <div className="flex flex-col gap-4">
      <div className="mb-2">
        <PageHeader
          title="버그 리포트"
          description={
            <>
              플레이 테스트 중 발견된 이슈를 등록하고 관리하세요.
              {blockerCount > 0 && (
                <span className="ml-2 font-medium text-red-400">Blocker {blockerCount}건 확인 필요</span>
              )}
            </>
          }
          action={
            <button
              onClick={() => setFormState({ mode: "create" })}
              disabled={supabaseMode && !activeProjectId}
              className={primaryButton}
            >
              <Plus className="h-4 w-4" />
              새 버그 리포트 작성
            </button>
          }
        />
      </div>

      {supabaseMode && supabaseBugs.error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
          {supabaseBugs.error}
        </p>
      )}

      <BugToolbar
        search={search}
        onSearchChange={setSearch}
        severityFilter={severityFilter}
        onSeverityFilterChange={setSeverityFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        hideResolved={hideResolved}
        onHideResolvedChange={setHideResolved}
      />

      <BugTable
        bugs={visibleBugs}
        onSelectBug={(bug) => setFormState({ mode: "edit", bug })}
        onToggleStatus={handleToggleStatus}
        expandedBugId={formState?.mode === "edit" ? formState.bug?.id : undefined}
      />

      <BugFormDrawer
        open={formState !== null}
        mode={formState?.mode ?? "create"}
        bug={formState?.bug}
        originLayoutId={formState?.mode === "edit" && formState.bug ? surfaceLayoutId("bug", formState.bug.id) : undefined}
        taskOptions={taskOptions}
        projectId={supabaseMode ? activeProjectId : undefined}
        onClose={() => setFormState(null)}
        onSubmit={handleFormSubmit}
        onRequestDelete={formState?.mode === "edit" ? () => setIsDeleteConfirmOpen(true) : undefined}
      />

      <DeleteConfirmModal
        open={isDeleteConfirmOpen}
        itemLabel="이 버그"
        onCancel={() => setIsDeleteConfirmOpen(false)}
        onConfirm={handleDeleteConfirmed}
      />
    </div>
    </HydrationGate>
  );
}
