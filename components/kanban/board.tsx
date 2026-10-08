"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, LayoutGroup } from "framer-motion";
import { Plus, Settings2 } from "lucide-react";
import type { Sprint, Task, TaskPriority, TaskStatus } from "@/lib/types";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/task-status";
import { useTasksStore } from "@/lib/store/tasks-store";
import { useWorkDomainsStore } from "@/lib/store/work-domains-store";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useActiveProject } from "@/lib/supabase/use-active-project";
import { useSupabaseTasks } from "@/lib/supabase/hooks/use-supabase-tasks";
import { useSupabaseWorkDomains } from "@/lib/supabase/hooks/use-supabase-work-domains";
import { useProjectMembers } from "@/lib/supabase/hooks/use-project-members";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { useTaskFormActions } from "@/lib/hooks/use-task-form-actions";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { TaskCard } from "./task-card";
import { StatusIcon } from "./status-icon";
import { PriorityFilter } from "./priority-filter";
import { PRIORITY_ORDER } from "./priority-badge";
import { TaskFormDrawer, type TaskFormValues } from "./task-form-drawer";
import { ConfirmMoveModal } from "./confirm-move-modal";
import { DeleteConfirmModal } from "./delete-confirm-modal";
import { primaryButton, secondaryButtonSm } from "@/components/ui/button-styles";
import { useSprints } from "@/lib/hooks/use-sprints";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { daysLeftInSprint, findCurrentSprint, formatSprintRange } from "@/lib/sprint-utils";
import { SprintManagerModal } from "./sprint-manager-modal";
import { PageHeader } from "@/components/layout/page-header";
import { Select } from "@/components/ui/select";
import { surfaceLayoutId } from "@/lib/motion";

interface FormState {
  mode: "create" | "edit";
  task?: Task;
}

interface PendingMove {
  taskId: string;
  toStatus: TaskStatus;
}

/** "스프린트 14 · 10월 1일 – 10월 14일 · 9일 남음" */
function describeSprint(sprint: Sprint) {
  const daysLeft = daysLeftInSprint(sprint);
  const status = daysLeft === null ? "시작 전" : daysLeft === 0 ? "종료됨" : `${daysLeft}일 남음`;
  return `${sprint.name} · ${formatSprintRange(sprint)} · ${status}`;
}

export function KanbanBoard({ deepLinkTaskId }: { deepLinkTaskId: string | null }) {
  const supabaseMode = isSupabaseConfigured();
  const currentUser = useCurrentUser();
  const { activeProject } = useActiveProject();
  const activeProjectId = supabaseMode ? (activeProject?.id ?? null) : null;

  // 두 데이터 소스 모두 항상 호출한다(Hooks 규칙) — 실제로 화면에 쓰이는 쪽만 아래에서 고른다.
  const mockTasks = useTasksStore((state) => state.tasks);
  const mockAddTask = useTasksStore((state) => state.addTask);
  const mockUpdateTask = useTasksStore((state) => state.updateTask);
  const mockDeleteTask = useTasksStore((state) => state.deleteTask);
  const mockMoveTask = useTasksStore((state) => state.moveTask);

  const supabaseTasks = useSupabaseTasks(activeProjectId, currentUser.id);
  const supabaseDomains = useSupabaseWorkDomains(activeProjectId);
  const mockDomains = useWorkDomainsStore((state) => state.domains);
  const domains = supabaseMode ? supabaseDomains.domains : mockDomains;
  const domainLabels = useMemo(() => new Map(domains.map((domain) => [domain.id, domain.label])), [domains]);
  const projectMembers = useProjectMembers(activeProjectId);

  const tasks = supabaseMode ? supabaseTasks.tasks : mockTasks;

  const sprintsApi = useSprints(activeProjectId);
  const { sprints } = sprintsApi;
  // 스프린트·오늘 날짜는 저장소와 시계에서 오므로 마운트 뒤에만 반영한다(서버 렌더와 어긋나지 않게).
  const hasMounted = useHasMounted();
  /** null이면 "지금 진행 중인 스프린트"를 자동으로 고른다. "all" = 전체 작업, "backlog" = 스프린트 없는 작업. */
  const [sprintSelection, setSprintSelection] = useState<string | null>(null);
  const [isSprintManagerOpen, setIsSprintManagerOpen] = useState(false);

  const knownSprintIds = useMemo(() => new Set(sprints.map((sprint) => sprint.id)), [sprints]);
  const currentSprint = hasMounted ? findCurrentSprint(sprints) : null;
  // 고른 스프린트가 삭제됐으면 자동 선택으로 돌아간다.
  const selection =
    sprintSelection && (sprintSelection === "all" || sprintSelection === "backlog" || knownSprintIds.has(sprintSelection))
      ? sprintSelection
      : currentSprint?.id ?? "all";
  const selectedSprint = sprints.find((sprint) => sprint.id === selection) ?? null;

  const sprintTasks = useMemo(() => {
    if (selection === "all") return tasks;
    // 목록에 없는 스프린트를 가리키는 작업(방금 삭제된 스프린트 등)은 백로그로 본다.
    if (selection === "backlog") return tasks.filter((task) => !task.sprintId || !knownSprintIds.has(task.sprintId));
    return tasks.filter((task) => task.sprintId === selection);
  }, [tasks, selection, knownSprintIds]);
  const doneCount = sprintTasks.filter((task) => task.status === "Done").length;
  const progressPercent = sprintTasks.length > 0 ? Math.round((doneCount / sprintTasks.length) * 100) : 0;

  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "ALL">("ALL");
  const [formState, setFormState] = useState<FormState | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // 알림(NotificationBell)에서 /kanban?task=<id>로 들어오면 그 작업 서랍을 연다. 작업이 목록에
  // 들어온 뒤에 한 번만 열고 주소에서 지운다 — 서랍을 닫은 뒤 새로고침해도 다시 열리지 않게.
  const router = useRouter();
  useEffect(() => {
    if (!deepLinkTaskId) return;
    const task = tasks.find((candidate) => candidate.id === deepLinkTaskId);
    if (!task) return;
    setSprintSelection(task.sprintId ?? "backlog"); // 그 작업이 속한 스프린트를 보여 카드가 화면에 있게 한다.
    setFormState({ mode: "edit", task });
    router.replace("/kanban", { scroll: false });
  }, [deepLinkTaskId, tasks, router]);

  const visibleTasks =
    priorityFilter === "ALL" ? sprintTasks : sprintTasks.filter((task) => task.priority === priorityFilter);

  const tasksByStatus = useMemo(() => {
    const groups = new Map<TaskStatus, Task[]>();
    for (const task of visibleTasks) {
      const existing = groups.get(task.status);
      if (existing) existing.push(task);
      else groups.set(task.status, [task]);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    }
    return groups;
  }, [visibleTasks]);

  function handleRequestMove(task: Task, direction: "prev" | "next") {
    const currentIndex = STATUS_ORDER.indexOf(task.status);
    const nextIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
    const toStatus = STATUS_ORDER[nextIndex];
    if (!toStatus) return;

    setPendingMove({ taskId: task.id, toStatus });
  }

  function confirmMove() {
    if (!pendingMove) return;
    if (supabaseMode) supabaseTasks.moveTask(pendingMove.taskId, pendingMove.toStatus);
    else mockMoveTask(pendingMove.taskId, pendingMove.toStatus);
    setPendingMove(null);
  }

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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="칸반 보드"
        description={selectedSprint ? describeSprint(selectedSprint) : "진행 중인 작업을 상태별로 확인하세요."}
        action={
          <button
            onClick={() => setFormState({ mode: "create" })}
            disabled={supabaseMode && !activeProjectId}
            className={primaryButton}
          >
            <Plus className="h-4 w-4" />
            새 작업 추가
          </button>
        }
      />
    <HydrationGate>
      <div className="flex flex-col gap-4">
      {supabaseMode && supabaseTasks.error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
          {supabaseTasks.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Select
          id="sprint-filter"
          aria-label="스프린트 선택"
          value={selection}
          onChange={setSprintSelection}
          options={[
            ...sprints.map((sprint) => ({
              value: sprint.id,
              triggerLabel: sprint.name,
              label: (
                <span className="flex items-center gap-2">
                  {sprint.name}
                  {sprint.id === currentSprint?.id && (
                    <span className="rounded-full bg-cyan-500/15 px-1.5 text-[11px] font-semibold text-cyan-300">
                      진행 중
                    </span>
                  )}
                </span>
              ),
            })),
            { value: "backlog", label: "백로그" },
            { value: "all", label: "전체 작업" },
          ]}
          wrapperClassName="shrink-0"
          className="min-w-[9rem] rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs font-medium text-zinc-200 focus:border-cyan-500 focus:outline-none"
        />

        <PriorityFilter value={priorityFilter} onChange={setPriorityFilter} />

        <div className="ml-auto flex items-center gap-3">
          {selectedSprint && (
            <div className="flex items-center gap-2 text-xs text-zinc-400" title={`완료 ${doneCount} / ${sprintTasks.length}`}>
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-800">
                <span className="block h-full rounded-full bg-cyan-500" style={{ width: `${progressPercent}%` }} />
              </span>
              <span className="tabular-nums">
                {doneCount}/{sprintTasks.length} 완료 · {progressPercent}%
              </span>
            </div>
          )}
          <button type="button" onClick={() => setIsSprintManagerOpen(true)} className={secondaryButtonSm}>
            <Settings2 className="h-3.5 w-3.5" />
            스프린트 관리
          </button>
        </div>
      </div>

      <LayoutGroup>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {STATUS_ORDER.map((status, index) => {
            const columnTasks = tasksByStatus.get(status) ?? [];

            return (
              <div key={status} className="flex max-h-[calc(100vh-240px)] min-w-0 flex-col gap-2">
                <div className="flex items-center gap-2 px-1 py-1">
                  <StatusIcon status={status} />
                  <h2 className="text-sm font-semibold text-zinc-200">{STATUS_LABELS[status]}</h2>
                  <span className="text-sm text-zinc-500">{columnTasks.length}</span>
                </div>

                {/* 좌우 여백은 카드 가장자리에 걸친 이동 버튼이 잘리지 않게 하기 위함이다. */}
                <div className="scrollbar-subtle -mx-3 flex-1 space-y-2 overflow-y-auto px-3 pb-2 pt-0.5">
                  <AnimatePresence mode="popLayout">
                    {columnTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        domainLabel={task.domainId ? domainLabels.get(task.domainId) : undefined}
                        isExpanded={formState?.mode === "edit" && formState.task?.id === task.id}
                        isFirstColumn={index === 0}
                        isLastColumn={index === STATUS_ORDER.length - 1}
                        onEdit={(selectedTask) => setFormState({ mode: "edit", task: selectedTask })}
                        onRequestMove={handleRequestMove}
                      />
                    ))}
                  </AnimatePresence>

                  {columnTasks.length === 0 && (
                    <p className="rounded-xl border border-dashed border-zinc-800 py-6 text-center text-xs text-zinc-600">작업 없음</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </LayoutGroup>

      <TaskFormDrawer
        open={formState !== null}
        mode={formState?.mode ?? "create"}
        task={formState?.task}
        projectMembers={supabaseMode ? projectMembers : undefined}
        domains={supabaseMode ? supabaseDomains.domains : undefined}
        projectId={supabaseMode ? activeProjectId : undefined}
        defaultSprintId={selectedSprint?.id}
        originLayoutId={formState?.mode === "edit" && formState.task ? surfaceLayoutId("task", formState.task.id) : undefined}
        onClose={() => setFormState(null)}
        onSubmit={handleFormSubmit}
        onRequestDelete={formState?.mode === "edit" ? () => setIsDeleteConfirmOpen(true) : undefined}
      />

      <ConfirmMoveModal
        open={pendingMove !== null}
        targetLabel={pendingMove ? STATUS_LABELS[pendingMove.toStatus] : ""}
        onCancel={() => setPendingMove(null)}
        onConfirm={confirmMove}
      />

      <SprintManagerModal
        open={isSprintManagerOpen}
        sprints={sprints}
        error={sprintsApi.error}
        onClose={() => setIsSprintManagerOpen(false)}
        onCreate={async (input) => Boolean(await sprintsApi.addSprint(input))}
        onUpdate={sprintsApi.updateSprint}
        onDelete={sprintsApi.removeSprint}
      />

      <DeleteConfirmModal
        open={isDeleteConfirmOpen}
        onCancel={() => setIsDeleteConfirmOpen(false)}
        onConfirm={handleDeleteConfirmed}
      />
      </div>
    </HydrationGate>
    </div>
  );
}
