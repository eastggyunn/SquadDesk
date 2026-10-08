import type { Task } from "@/lib/types";
import type { TaskDraft } from "@/lib/store/tasks-store";
import type { TaskFormValues } from "@/components/kanban/task-form-drawer";
import type { TaskWriteInput } from "@/lib/supabase/repositories/tasks";

interface TaskFormState {
  mode: "create" | "edit";
  task?: Task;
}

interface UseTaskFormActionsArgs<T extends TaskFormState> {
  supabaseMode: boolean;
  formState: T | null;
  setFormState: (state: T | null) => void;
  setIsDeleteConfirmOpen: (open: boolean) => void;
  supabaseAddTask: (input: TaskWriteInput, pendingFiles: Map<string, File>) => Promise<void>;
  supabaseUpdateTask: (taskId: string, input: TaskWriteInput, pendingFiles: Map<string, File>) => Promise<void>;
  supabaseDeleteTask: (taskId: string) => void;
  mockAddTask: (draft: TaskDraft) => void;
  mockUpdateTask: (taskId: string, draft: TaskDraft) => void;
  mockDeleteTask: (taskId: string) => void;
}

/**
 * 칸반/일정/업무 영역 화면이 공유하는 작업 폼 제출·삭제 핸들러. supabaseMode에 따라
 * Supabase 작업(TaskWriteInput)과 Zustand 목업 draft 중 하나로 값을 변환해 위임한다.
 * Supabase 경로는 저장(첨부 업로드 포함)이 끝난 뒤에만 폼을 닫는다 — 실패하면 예외가
 * 그대로 전파되어 TaskForm이 폼을 연 채로 에러를 보여주고 재시도할 수 있게 한다.
 */
export function useTaskFormActions<T extends TaskFormState>({
  supabaseMode,
  formState,
  setFormState,
  setIsDeleteConfirmOpen,
  supabaseAddTask,
  supabaseUpdateTask,
  supabaseDeleteTask,
  mockAddTask,
  mockUpdateTask,
  mockDeleteTask,
}: UseTaskFormActionsArgs<T>) {
  async function handleFormSubmit(values: TaskFormValues) {
    if (supabaseMode) {
      const input: TaskWriteInput = {
        title: values.title,
        assigneeId: values.assigneeId ?? "",
        priority: values.priority,
        startDate: values.startDate || undefined,
        dueDate: values.dueDate || undefined,
        domainId: values.domainId,
        sprintId: values.sprintId,
        attachments: values.attachments,
      };
      if (formState?.mode === "edit" && formState.task) {
        await supabaseUpdateTask(formState.task.id, input, values.pendingFiles);
      } else {
        await supabaseAddTask(input, values.pendingFiles);
      }
      setFormState(null);
      return;
    }

    const draft: TaskDraft = {
      title: values.title,
      assignee: { name: values.assigneeName, role: values.assigneeRole },
      startDate: values.startDate || undefined,
      dueDate: values.dueDate || undefined,
      priority: values.priority,
      attachments: values.attachments,
      domainId: values.domainId,
      sprintId: values.sprintId,
    };

    if (formState?.mode === "edit" && formState.task) {
      mockUpdateTask(formState.task.id, draft);
    } else {
      mockAddTask(draft);
    }

    setFormState(null);
  }

  function handleDeleteConfirmed() {
    if (!formState?.task) return;
    if (supabaseMode) supabaseDeleteTask(formState.task.id);
    else mockDeleteTask(formState.task.id);
    setIsDeleteConfirmOpen(false);
    setFormState(null);
  }

  return { handleFormSubmit, handleDeleteConfirmed };
}
