"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Github, Unplug } from "lucide-react";
import type { ProjectRepositoryRow } from "@/lib/supabase/schema";
import { listRepositoryWorkflowOptions, type RepositoryWorkflow } from "@/lib/github/connect-actions";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  disconnectProjectRepository,
  updateProjectRepositoryFilters,
} from "@/lib/supabase/repositories/project-repositories";
import { ErrorAlert } from "@/components/ui/error-alert";
import { ModalPortal } from "@/components/ui/modal-portal";
import { primaryButton, secondaryButton } from "@/components/ui/button-styles";
import { DeleteConfirmModal } from "@/components/kanban/delete-confirm-modal";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";
import { FADE, SPRING } from "@/lib/motion";
import { useOverlayDepth } from "@/lib/store/overlay-store";
import { ALL_WORKFLOWS, RepositoryFilterFields, type RepositoryFilterValues } from "./repository-filter-fields";

interface RepositorySettingsModalProps {
  /** 열 저장소. null이면 닫힘. */
  repository: ProjectRepositoryRow | null;
  projectId: string;
  onClose: () => void;
  /** 저장하거나 연결을 해제한 뒤 — 목록을 다시 읽는다. */
  onChanged: (message: string) => void;
}

/** 연결된 저장소의 받을 빌드 범위 변경 + 연결 해제. 연결한 본인과 owner에게만 열린다. */
export function RepositorySettingsModal({ repository, ...props }: RepositorySettingsModalProps) {
  useOverlayDepth(repository !== null);
  return (
    <ModalPortal>
      <AnimatePresence>
        {repository && <RepositorySettingsContent key={repository.id} repository={repository} {...props} />}
      </AnimatePresence>
    </ModalPortal>
  );
}

function RepositorySettingsContent({
  repository,
  projectId,
  onClose,
  onChanged,
}: Omit<RepositorySettingsModalProps, "repository"> & { repository: ProjectRepositoryRow }) {
  const shouldReduceMotion = useReducedMotion();
  const [filters, setFilters] = useState<RepositoryFilterValues>({
    buildSource: repository.build_source,
    workflowPath: repository.workflow_path ?? ALL_WORKFLOWS,
    branch: repository.branch_filter ?? "",
  });
  const [workflows, setWorkflows] = useState<RepositoryWorkflow[] | null | "unavailable">(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmingDisconnect, setIsConfirmingDisconnect] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  // 해제 확인 모달이 떠 있으면 Esc는 그쪽이 먼저 받는다(스택형 useEscapeKey).
  useEscapeKey(onClose);

  useEffect(() => {
    let cancelled = false;
    // 이 GitHub 계정을 직접 검증하지 않은 사람(예: 남이 연결한 저장소를 보는 owner)은 목록을 못 읽는다 → 직접 입력.
    listRepositoryWorkflowOptions(projectId, repository.installation_id, repository.repo_id).then((result) => {
      if (!cancelled) setWorkflows(result.ok ? result.workflows : "unavailable");
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, repository.installation_id, repository.repo_id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await updateProjectRepositoryFilters(getBrowserSupabaseClient(), repository.id, {
        build_source: filters.buildSource,
        workflow_path: filters.workflowPath.trim() || null,
        branch_filter: filters.branch.trim() || null,
      });
      onChanged("저장소 설정을 저장했습니다. 다음 빌드부터 적용됩니다.");
    } catch {
      setError("설정을 저장하지 못했습니다. 연결한 사람이나 프로젝트 owner만 바꿀 수 있습니다.");
      setIsSaving(false);
    }
  }

  async function handleDisconnect() {
    setIsDisconnecting(true);
    try {
      await disconnectProjectRepository(getBrowserSupabaseClient(), repository.id);
      onChanged(`${repository.repo_full_name} 연결을 해제했습니다. 받은 빌드 기록은 남아 있습니다.`);
    } catch {
      setError("연결을 해제하지 못했습니다. 연결한 사람이나 프로젝트 owner만 해제할 수 있습니다.");
      setIsDisconnecting(false);
      setIsConfirmingDisconnect(false);
    }
  }

  return (
    <>
      <motion.div
        key="repository-settings-backdrop"
        className="fixed inset-0 z-[70] bg-black/70"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={FADE}
        onClick={onClose}
      />
      <motion.div
        key="repository-settings-panel"
        className="fixed inset-0 z-[70] flex items-center justify-center p-4"
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, transition: SPRING.exit }}
        transition={SPRING.modal}
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="repository-settings-title"
          onClick={(event) => event.stopPropagation()}
          className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-400">
              <Github className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 id="repository-settings-title" className="text-sm font-semibold text-zinc-100">
                저장소 설정
              </h2>
              <p className="truncate text-xs text-zinc-500">{repository.repo_full_name}</p>
            </div>
          </div>

          <ErrorAlert message={error} className="mt-4 !text-xs" />

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            <RepositoryFilterFields values={filters} onChange={setFilters} workflows={workflows} />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setIsConfirmingDisconnect(true)}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-red-400 transition-[transform,background-color] duration-150 hover:bg-red-500/10 active:scale-[0.97]"
              >
                <Unplug className="h-4 w-4" />
                연결 해제
              </button>
              <div className="ml-auto flex gap-2">
                <button type="button" onClick={onClose} className={secondaryButton}>
                  취소
                </button>
                <button type="submit" disabled={isSaving} className={primaryButton}>
                  {isSaving ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </motion.div>

      <DeleteConfirmModal
        open={isConfirmingDisconnect}
        description={`${repository.repo_full_name} 연결을 해제할까요?`}
        helperText="새 빌드를 더 받지 않고, 이미 받은 빌드도 다운로드할 수 없게 됩니다. 기록은 남고 나중에 다시 연결할 수 있습니다."
        confirmLabel="연결 해제"
        isConfirming={isDisconnecting}
        onCancel={() => setIsConfirmingDisconnect(false)}
        onConfirm={() => void handleDisconnect()}
      />
    </>
  );
}
