"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FolderPlus, Pencil } from "lucide-react";
import { PROJECT_NAME_MAX_LENGTH, validateProjectName } from "@/lib/supabase/repositories/projects";
import { ErrorAlert } from "@/components/ui/error-alert";
import { ModalPortal } from "@/components/ui/modal-portal";
import { primaryButton, secondaryButton } from "@/components/ui/button-styles";
import { FADE, SPRING } from "@/lib/motion";
import { useOverlayDepth } from "@/lib/store/overlay-store";

export type ProjectFormMode = "create" | "rename";

interface ProjectFormModalProps {
  open: boolean;
  mode: ProjectFormMode;
  /** 이름 변경 모달의 초기값. 생성 모달에서는 빈 문자열이다. */
  initialName: string;
  /**
   * 중복 검사 대상 이름들. DB 트리거 enforce_project_name_unique_for_actor()와 같은
   * 범위("내가 속한 프로젝트들")여야 하고, 이름 변경 시에는 대상 프로젝트 자신을
   * 빼야 자기 이름으로 되돌리는 것이 막히지 않는다.
   */
  otherProjectNames: string[];
  /** RPC가 돌려준 실패 문구(권한·중복 등). 클라이언트 검증 문구보다 뒤에 표시한다. */
  submitError: string | null;
  isSubmitting: boolean;
  /** 입력이 바뀌면 호출 — 직전 제출 실패 문구가 새 이름을 입력하는 동안 남아 있지 않게 한다. */
  onDirty: () => void;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

const COPY: Record<ProjectFormMode, { title: string; label: string; placeholder: string; submit: string }> = {
  create: {
    title: "새 프로젝트",
    label: "프로젝트 이름",
    placeholder: "예: 2025 신규 서비스",
    submit: "만들기",
  },
  rename: {
    title: "프로젝트 이름 변경",
    label: "새 이름",
    placeholder: "새 프로젝트 이름",
    submit: "이름 변경",
  },
};

/** 프로젝트 생성 / 이름 변경 입력 모달. */
export function ProjectFormModal({ open, ...props }: ProjectFormModalProps) {
  useOverlayDepth(open);
  return (
    <ModalPortal>
      <AnimatePresence>{open && <ProjectFormModalContent {...props} />}</AnimatePresence>
    </ModalPortal>
  );
}

function ProjectFormModalContent({
  mode,
  initialName,
  otherProjectNames,
  submitError,
  isSubmitting,
  onDirty,
  onSubmit,
  onClose,
}: Omit<ProjectFormModalProps, "open">) {
  const shouldReduceMotion = useReducedMotion();
  // 모달이 닫히면 이 컴포넌트 자체가 언마운트되므로, 입력값은 열릴 때마다 초기화된다.
  const [name, setName] = useState(initialName);
  const [validationError, setValidationError] = useState<string | null>(null);
  const copy = COPY[mode];

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const message = validateProjectName(name, otherProjectNames);
    setValidationError(message);
    if (message) return;

    onSubmit(name);
  }

  return (
    <>
      <motion.div
        key="project-form-backdrop"
        className="fixed inset-0 z-[70] bg-black/70"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={FADE}
        onClick={onClose}
      />

      <motion.div
        key="project-form-panel"
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
          aria-labelledby="project-form-title"
          onClick={(event) => event.stopPropagation()}
          className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl"
        >
          <form onSubmit={handleSubmit}>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-400">
                {mode === "create" ? <FolderPlus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
              </span>
              <h2 id="project-form-title" className="text-sm font-semibold text-zinc-100">
                {copy.title}
              </h2>
            </div>

            <label htmlFor="project-name" className="mt-4 block text-xs font-medium text-zinc-400">
              {copy.label}
            </label>
            <input
              id="project-name"
              autoFocus
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setValidationError(null);
                onDirty();
              }}
              maxLength={PROJECT_NAME_MAX_LENGTH}
              placeholder={copy.placeholder}
              className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500 focus:outline-none"
            />
            <p className="mt-1.5 text-[11px] text-zinc-600">1~{PROJECT_NAME_MAX_LENGTH}자로 입력해주세요.</p>

            <ErrorAlert message={validationError ?? submitError} className="mt-3 !text-xs" />

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className={`flex-1 ${secondaryButton}`}
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className={`flex-1 ${primaryButton}`}
              >
                {isSubmitting ? "저장 중..." : copy.submit}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </>
  );
}
