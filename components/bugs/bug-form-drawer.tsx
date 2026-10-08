"use client";

import type { Bug } from "@/lib/types";
import { SlideOverPanel } from "@/components/ui/slide-over-panel";
import { BugForm, type BugFormValues, type TaskOption } from "./bug-form";

export type { BugFormValues } from "./bug-form";

interface BugFormDrawerProps {
  open: boolean;
  mode: "create" | "edit";
  bug?: Bug;
  taskOptions?: TaskOption[];
  projectId?: string | null;
  /** 기존 버그를 열 때 그 표 행 배경과 공유하는 layoutId(surfaceLayoutId) — 칸반 카드와 같은 전환. */
  originLayoutId?: string;
  onClose: () => void;
  onSubmit: (values: BugFormValues) => void | Promise<void>;
  onRequestDelete?: () => void;
}

export function BugFormDrawer({
  open,
  mode,
  bug,
  taskOptions,
  projectId,
  originLayoutId,
  onClose,
  onSubmit,
  onRequestDelete,
}: BugFormDrawerProps) {
  return (
    <SlideOverPanel
      open={open}
      onClose={onClose}
      ariaLabel={mode === "create" ? "새 버그 리포트 작성" : "버그 리포트 수정"}
      originLayoutId={originLayoutId}
    >
      <BugForm
        mode={mode}
        bug={bug}
        taskOptions={taskOptions}
        projectId={projectId}
        onClose={onClose}
        onSubmit={onSubmit}
        onRequestDelete={onRequestDelete}
      />
    </SlideOverPanel>
  );
}
