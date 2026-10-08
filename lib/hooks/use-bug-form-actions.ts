import type { Assignee, Bug } from "@/lib/types";
import type { BugDraft } from "@/lib/store/bugs-store";
import type { BugFormValues } from "@/components/bugs/bug-form-drawer";
import type { BugWriteInput } from "@/lib/supabase/repositories/bugs";

interface BugFormState {
  mode: "create" | "edit";
  bug?: Bug;
}

interface UseBugFormActionsArgs<T extends BugFormState> {
  supabaseMode: boolean;
  formState: T | null;
  setFormState: (state: T | null) => void;
  setIsDeleteConfirmOpen: (open: boolean) => void;
  currentUserAssignee: Assignee;
  supabaseAddBug: (input: BugWriteInput, pendingFiles: Map<string, File>) => Promise<void>;
  supabaseUpdateBug: (bugId: string, input: BugWriteInput, pendingFiles: Map<string, File>) => Promise<void>;
  supabaseDeleteBug: (bugId: string) => void;
  mockAddBug: (draft: BugDraft, reporter: Assignee) => void;
  mockUpdateBug: (bugId: string, draft: BugDraft) => void;
  mockDeleteBug: (bugId: string) => void;
}

/**
 * 버그 보드가 쓰는 버그 폼 제출·삭제 핸들러 — use-task-form-actions.ts와 같은 모양이다.
 * Supabase 경로는 저장(첨부 업로드 포함)이 끝난 뒤에만 폼을 닫는다 — 실패하면 예외가
 * 그대로 전파되어 BugForm이 폼을 연 채로 에러를 보여주고 재시도할 수 있게 한다.
 */
export function useBugFormActions<T extends BugFormState>({
  supabaseMode,
  formState,
  setFormState,
  setIsDeleteConfirmOpen,
  currentUserAssignee,
  supabaseAddBug,
  supabaseUpdateBug,
  supabaseDeleteBug,
  mockAddBug,
  mockUpdateBug,
  mockDeleteBug,
}: UseBugFormActionsArgs<T>) {
  async function handleFormSubmit(values: BugFormValues) {
    if (supabaseMode) {
      const input: BugWriteInput = {
        title: values.title,
        severity: values.severity,
        location: values.location,
        status: values.status,
        reproductionSteps: values.reproductionSteps,
        consoleLog: values.consoleLog,
        taskId: values.taskId,
        attachments: values.attachments,
      };
      if (formState?.mode === "edit" && formState.bug) {
        await supabaseUpdateBug(formState.bug.id, input, values.pendingFiles);
      } else {
        await supabaseAddBug(input, values.pendingFiles);
      }
      setFormState(null);
      return;
    }

    if (formState?.mode === "edit" && formState.bug) {
      mockUpdateBug(formState.bug.id, values);
    } else {
      mockAddBug(values, currentUserAssignee);
    }

    setFormState(null);
  }

  function handleDeleteConfirmed() {
    if (!formState?.bug) return;
    if (supabaseMode) supabaseDeleteBug(formState.bug.id);
    else mockDeleteBug(formState.bug.id);
    setIsDeleteConfirmOpen(false);
    setFormState(null);
  }

  return { handleFormSubmit, handleDeleteConfirmed };
}
