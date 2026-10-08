"use client";

import { useCallback, useMemo, useState } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import type { Task } from "@/lib/types";
import { useTasksStore } from "@/lib/store/tasks-store";
import { useWorkDomainsStore } from "@/lib/store/work-domains-store";
import { useBugsStore, countBugsByTask } from "@/lib/store/bugs-store";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useActiveProject } from "@/lib/supabase/use-active-project";
import { useSupabaseTasks } from "@/lib/supabase/hooks/use-supabase-tasks";
import { useSupabaseBugs } from "@/lib/supabase/hooks/use-supabase-bugs";
import { useSupabaseWorkDomains } from "@/lib/supabase/hooks/use-supabase-work-domains";
import { useProjectMembers } from "@/lib/supabase/hooks/use-project-members";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { useTaskFormActions } from "@/lib/hooks/use-task-form-actions";
import { withObjectParticle } from "@/lib/format";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { DeleteConfirmModal } from "@/components/kanban/delete-confirm-modal";
import { TaskFormDrawer, type TaskFormValues } from "@/components/kanban/task-form-drawer";
import { DomainCard } from "./domain-card";
import { AddDomainControl } from "./add-domain-control";
import { DomainTaskTable } from "./domain-task-table";
import { PageHeader } from "@/components/layout/page-header";
import { surfaceLayoutId } from "@/lib/motion";

/** 작업이 없는 영역에 매번 새 빈 배열을 넘기면 memo된 DomainCard가 다시 그려지므로 하나를 공유한다. */
const NO_TASKS: Task[] = [];

const DOMAINS_TITLE = "업무 영역";
const DOMAINS_DESCRIPTION = "업무 영역별로 작업을 묶어서 진행 상황을 확인하세요.";

interface FormState {
  mode: "create" | "edit";
  task?: Task;
  defaultDomainId?: string;
}

export function DomainsView() {
  const supabaseMode = isSupabaseConfigured();
  const currentUser = useCurrentUser();
  const { activeProject } = useActiveProject();
  const activeProjectId = supabaseMode ? (activeProject?.id ?? null) : null;

  // 두 데이터 소스 모두 항상 호출한다(Hooks 규칙) — 실제로 화면에 쓰이는 쪽만 아래에서 고른다.
  const mockTasks = useTasksStore((state) => state.tasks);
  const mockAddTask = useTasksStore((state) => state.addTask);
  const mockUpdateTask = useTasksStore((state) => state.updateTask);
  const mockDeleteTask = useTasksStore((state) => state.deleteTask);

  const mockDomains = useWorkDomainsStore((state) => state.domains);
  const mockAddDomain = useWorkDomainsStore((state) => state.addDomain);
  const mockRemoveDomain = useWorkDomainsStore((state) => state.removeDomain);
  const mockReorderDomains = useWorkDomainsStore((state) => state.reorderDomains);

  const mockBugs = useBugsStore((state) => state.bugs);

  const supabaseTasks = useSupabaseTasks(activeProjectId, currentUser.id);
  const supabaseBugs = useSupabaseBugs(activeProjectId, currentUser.id);
  const supabaseDomains = useSupabaseWorkDomains(activeProjectId);
  const projectMembers = useProjectMembers(activeProjectId);

  const tasks = supabaseMode ? supabaseTasks.tasks : mockTasks;
  const domains = supabaseMode ? supabaseDomains.domains : mockDomains;
  const bugCountsByTask = useMemo(
    () => countBugsByTask(supabaseMode ? supabaseBugs.bugs : mockBugs),
    [supabaseMode, supabaseBugs.bugs, mockBugs]
  );

  const [formState, setFormState] = useState<FormState | null>(null);
  const expandedTaskId = formState?.mode === "edit" ? formState.task?.id : undefined;
  const expandedDomainId = formState?.mode === "edit" ? formState.task?.domainId : undefined;
  const handleSelectTask = useCallback((task: Task) => setFormState({ mode: "edit", task }), []);
  const handleAddTask = useCallback(
    (domainId: string) => setFormState({ mode: "create", defaultDomainId: domainId }),
    []
  );
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  // 업무 영역 삭제 확인은 작업 삭제 확인(isDeleteConfirmOpen)과 별도 상태로 다룬다.
  // id만 들고 있다가 렌더 시점에 find()로 이름을 구해, 모달이 열려 있는 동안 목록이 갱신돼도
  // 항상 최신 라벨을 보여준다(SyncedAssetsWidget의 pendingDeleteCategoryId와 동일한 관례).
  const [pendingDomainDeleteId, setPendingDomainDeleteId] = useState<string | null>(null);

  const { tasksByDomain, unclassifiedTasks } = useMemo(() => {
    const domainIds = new Set(domains.map((domain) => domain.id));
    const byDomain = new Map<string, Task[]>();
    const unclassified: Task[] = [];

    for (const task of tasks) {
      if (task.domainId && domainIds.has(task.domainId)) {
        const existing = byDomain.get(task.domainId);
        if (existing) existing.push(task);
        else byDomain.set(task.domainId, [task]);
      } else {
        unclassified.push(task);
      }
    }

    return { tasksByDomain: byDomain, unclassifiedTasks: unclassified };
  }, [tasks, domains]);

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

  async function handleDomainDeleteConfirmed() {
    if (!pendingDomainDeleteId) return;
    if (supabaseMode) {
      const succeeded = await supabaseDomains.removeDomain(pendingDomainDeleteId);
      if (succeeded) setPendingDomainDeleteId(null);
    } else {
      mockRemoveDomain(pendingDomainDeleteId);
      setPendingDomainDeleteId(null);
    }
  }

  const pendingDomainDelete = domains.find((domain) => domain.id === pendingDomainDeleteId);

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    if (result.destination.index === result.source.index) return;
    if (supabaseMode) supabaseDomains.reorderDomains(result.source.index, result.destination.index);
    else mockReorderDomains(result.source.index, result.destination.index);
  }

  if (supabaseMode && !activeProjectId) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={DOMAINS_TITLE} description={DOMAINS_DESCRIPTION} />
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-10 text-center text-sm text-zinc-500">
          소속된 프로젝트가 없습니다. 프로젝트에 참여한 뒤 다시 확인해주세요.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={DOMAINS_TITLE}
        description={DOMAINS_DESCRIPTION}
        action={
          <AddDomainControl
            onCreate={(label) => (supabaseMode ? supabaseDomains.addDomain(label) : mockAddDomain(label))}
            isSubmitting={supabaseMode ? supabaseDomains.isAddingDomain : false}
          />
        }
      />
    <HydrationGate>
    <div className="flex w-full flex-col gap-4">
      {supabaseMode && (supabaseTasks.error || supabaseDomains.error || supabaseBugs.error) && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
          {supabaseTasks.error ?? supabaseDomains.error ?? supabaseBugs.error}
        </p>
      )}

      {supabaseMode && supabaseDomains.isLoading ? (
        <div className="flex h-32 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/30 text-sm text-zinc-500">
          업무 영역을 불러오는 중입니다...
        </div>
      ) : domains.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/30 text-sm text-zinc-500">
          등록된 업무 영역이 없습니다.
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="work-domains">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="grid w-full grid-cols-1 gap-4"
              >
                {domains.map((domain, index) => (
                  <Draggable key={domain.id} draggableId={domain.id} index={index}>
                    {(dragProvided, dragSnapshot) => (
                      <div
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        className={dragSnapshot.isDragging ? "opacity-90" : ""}
                      >
                        <DomainCard
                          domain={domain}
                          tasks={tasksByDomain.get(domain.id) ?? NO_TASKS}
                          bugCountsByTask={bugCountsByTask}
                          dragHandleProps={dragProvided.dragHandleProps}
                          onRemoveDomain={setPendingDomainDeleteId}
                          onSelectTask={handleSelectTask}
                          expandedTaskId={expandedDomainId === domain.id ? expandedTaskId : undefined}
                          onAddTask={handleAddTask}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {unclassifiedTasks.length > 0 && (
        <div className="w-full rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <h2 className="text-sm font-semibold text-zinc-400">미분류 작업</h2>
          <div className="mt-3">
            <DomainTaskTable
              tasks={unclassifiedTasks}
              bugCountsByTask={bugCountsByTask}
              onSelectTask={handleSelectTask}
              expandedTaskId={expandedTaskId}
            />
          </div>
        </div>
      )}

      <TaskFormDrawer
        open={formState !== null}
        mode={formState?.mode ?? "create"}
        task={formState?.task}
        defaultDomainId={formState?.defaultDomainId}
        originLayoutId={formState?.mode === "edit" && formState.task ? surfaceLayoutId("task", formState.task.id) : undefined}
        projectMembers={supabaseMode ? projectMembers : undefined}
        domains={supabaseMode ? domains : undefined}
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

      <DeleteConfirmModal
        open={pendingDomainDeleteId !== null}
        description={
          pendingDomainDelete ? `업무 영역 ${withObjectParticle(`"${pendingDomainDelete.label}"`)} 삭제하시겠습니까?` : undefined
        }
        helperText="이 영역의 작업은 삭제되지 않고 미분류 작업으로 남습니다."
        isConfirming={supabaseMode ? supabaseDomains.isRemovingDomain : false}
        onCancel={() => setPendingDomainDeleteId(null)}
        onConfirm={handleDomainDeleteConfirmed}
      />
    </div>
    </HydrationGate>
    </div>
  );
}
