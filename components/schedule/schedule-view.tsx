"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { Task } from "@/lib/types";
import { useTasksStore } from "@/lib/store/tasks-store";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useActiveProject } from "@/lib/supabase/use-active-project";
import { useSupabaseTasks } from "@/lib/supabase/hooks/use-supabase-tasks";
import { useSupabaseWorkDomains } from "@/lib/supabase/hooks/use-supabase-work-domains";
import { useProjectMembers } from "@/lib/supabase/hooks/use-project-members";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { useTaskFormActions } from "@/lib/hooks/use-task-form-actions";
import { DeleteConfirmModal } from "@/components/kanban/delete-confirm-modal";
import { TaskFormDrawer, type TaskFormValues } from "@/components/kanban/task-form-drawer";
import { TaskListPanel } from "./task-list-panel";
import { GanttChart } from "./gantt-chart";
import { ViewModeControls } from "./view-mode-controls";
import { getDateX, getTimelineRange, type ViewMode } from "./gantt-utils";
import { primaryButton } from "@/components/ui/button-styles";
import { PageHeader } from "@/components/layout/page-header";
import { surfaceLayoutId } from "@/lib/motion";

interface FormState {
  mode: "create" | "edit";
  task?: Task;
}

export function ScheduleView() {
  const hasMounted = useHasMounted();
  const supabaseMode = isSupabaseConfigured();
  const currentUser = useCurrentUser();
  const { activeProject } = useActiveProject();
  const activeProjectId = supabaseMode ? (activeProject?.id ?? null) : null;

  // 두 데이터 소스 모두 항상 호출한다(Hooks 규칙) — 실제로 화면에 쓰이는 쪽만 아래에서 고른다.
  const mockTasks = useTasksStore((state) => state.tasks);
  const mockAddTask = useTasksStore((state) => state.addTask);
  const mockUpdateTask = useTasksStore((state) => state.updateTask);
  const mockDeleteTask = useTasksStore((state) => state.deleteTask);

  const supabaseTasks = useSupabaseTasks(activeProjectId, currentUser.id);
  const supabaseDomains = useSupabaseWorkDomains(activeProjectId);
  const projectMembers = useProjectMembers(activeProjectId);

  const tasks = supabaseMode ? supabaseTasks.tasks : mockTasks;

  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [formState, setFormState] = useState<FormState | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const range = useMemo(() => getTimelineRange(tasks), [tasks]);

  function scrollToToday(behavior: ScrollBehavior) {
    const container = scrollRef.current;
    if (!container) return;
    const todayX = getDateX(new Date(), viewMode, range);
    container.scrollTo({ left: Math.max(todayX - 160, 0), behavior });
  }

  useEffect(() => {
    if (!hasMounted) return;
    scrollToToday("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMounted, viewMode]);

  const handleSelectTask = useCallback((task: Task) => setFormState({ mode: "edit", task }), []);

  const { handleFormSubmit, handleDeleteConfirmed } = useTaskFormActions({
    supabaseMode,
    formState,
    setFormState,
    setIsDeleteConfirmOpen,
    supabaseAddTask: supabaseTasks.addTask,
    supabaseUpdateTask: supabaseTasks.updateTask,
    supabaseDeleteTask: supabaseTasks.deleteTask,
    mockAddTask,
    mockUpdateTask,
    mockDeleteTask,
  });

  const header = (
    <PageHeader
      title="일정 관리"
      description="작업 기간을 로드맵 형태로 한눈에 확인하세요."
      action={
        <button type="button" onClick={() => setFormState({ mode: "create" })} className={primaryButton}>
          <Plus className="h-4 w-4" />
          새 작업 추가
        </button>
      }
    />
  );

  if (!hasMounted) return header;

  if (supabaseMode && !activeProjectId) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-10 text-center text-sm text-zinc-500">
          소속된 프로젝트가 없습니다. 프로젝트에 참여한 뒤 다시 확인해주세요.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-2">{header}</div>
      {supabaseMode && supabaseTasks.error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
          {supabaseTasks.error}
        </p>
      )}

      <ViewModeControls
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        onToday={() => scrollToToday("smooth")}
      />

      {supabaseMode && supabaseTasks.isLoading ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/30 text-sm text-zinc-500">
          작업을 불러오는 중입니다...
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/30 text-sm text-zinc-500">
          등록된 작업이 없습니다.
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex max-h-[70vh] overflow-auto rounded-xl border border-zinc-800 bg-zinc-900/30"
        >
          <TaskListPanel tasks={tasks} />
          <GanttChart
            tasks={tasks}
            viewMode={viewMode}
            range={range}
            onSelectTask={handleSelectTask}
            expandedTaskId={formState?.mode === "edit" ? formState.task?.id : undefined}
          />
        </div>
      )}

      <TaskFormDrawer
        open={formState !== null}
        mode={formState?.mode ?? "create"}
        task={formState?.task}
        originLayoutId={formState?.mode === "edit" && formState.task ? surfaceLayoutId("task", formState.task.id) : undefined}
        projectMembers={supabaseMode ? projectMembers : undefined}
        domains={supabaseMode ? supabaseDomains.domains : undefined}
        projectId={supabaseMode ? activeProjectId : undefined}
        onClose={() => setFormState(null)}
        onSubmit={handleFormSubmit}
        onRequestDelete={formState?.mode === "edit" ? () => setIsDeleteConfirmOpen(true) : undefined}
      />

      <DeleteConfirmModal
        open={isDeleteConfirmOpen}
        onCancel={() => setIsDeleteConfirmOpen(false)}
        onConfirm={handleDeleteConfirmed}
      />
    </div>
  );
}
