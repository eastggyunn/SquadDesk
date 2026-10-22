"use client";

import type { Task } from "@/lib/types";
import type { WorkDomain } from "@/lib/store/work-domains-store";
import { SlideOverPanel } from "@/components/ui/slide-over-panel";
import { TaskForm, type TaskFormValues } from "./task-form";
import { TaskComments } from "./task-comments";
import { TaskBuildsSection } from "@/components/builds/task-builds-section";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { ProjectMemberOption } from "@/lib/supabase/repositories/project-members";

export type { TaskFormValues } from "./task-form";

interface TaskFormDrawerProps {
  open: boolean;
  mode: "create" | "edit";
  task?: Task;
  defaultDomainId?: string;
  defaultSprintId?: string;
  /** 칸반 카드에서 열 때 카드 배경과 공유하는 layoutId — 카드 자체가 커지며 서랍이 된다. */
  originLayoutId?: string;
  projectMembers?: ProjectMemberOption[];
  domains?: WorkDomain[];
  projectId?: string | null;
  onClose: () => void;
  onSubmit: (values: TaskFormValues) => void | Promise<void>;
  onRequestDelete?: () => void;
}

export function TaskFormDrawer({
  open,
  mode,
  task,
  defaultDomainId,
  defaultSprintId,
  originLayoutId,
  projectMembers,
  domains,
  projectId,
  onClose,
  onSubmit,
  onRequestDelete,
}: TaskFormDrawerProps) {
  return (
    <SlideOverPanel
      open={open}
      onClose={onClose}
      ariaLabel={mode === "create" ? "새 작업 추가" : "작업 수정"}
      originLayoutId={originLayoutId}
    >
      <TaskForm
        mode={mode}
        task={task}
        defaultDomainId={defaultDomainId}
        defaultSprintId={defaultSprintId}
        projectMembers={projectMembers}
        domains={domains}
        projectId={projectId}
        onClose={onClose}
        onSubmit={onSubmit}
        onRequestDelete={onRequestDelete}
      />
      {/* 빌드 연결은 실제 Supabase 모드의 저장된 작업에만 — 빌드가 없는 프로젝트면 섹션이 스스로 숨는다. */}
      {mode === "edit" && task && projectId && isSupabaseConfigured() && (
        <TaskBuildsSection taskId={task.id} projectId={projectId} />
      )}
      {/* 댓글은 이미 저장된 작업에만 단다. */}
      {mode === "edit" && task && (
        <TaskComments
          taskId={task.id}
          projectId={projectId ?? null}
          projectMembers={projectMembers ?? []}
        />
      )}
    </SlideOverPanel>
  );
}
