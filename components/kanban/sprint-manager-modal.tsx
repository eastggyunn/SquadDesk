"use client";

import { useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Pencil, Trash2, X } from "lucide-react";
import type { Sprint } from "@/lib/types";
import type { SprintWriteInput } from "@/lib/supabase/repositories/sprints";
import { daysLeftInSprint, formatSprintRange, todayString } from "@/lib/sprint-utils";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";
import { ModalPortal } from "@/components/ui/modal-portal";
import { primaryButton, secondaryButton } from "@/components/ui/button-styles";
import { DatePicker } from "./date-picker";
import { FADE, SPRING } from "@/lib/motion";
import { useOverlayDepth } from "@/lib/store/overlay-store";

const SPRINT_LENGTH_DAYS = 14;

interface SprintManagerModalProps {
  open: boolean;
  sprints: Sprint[];
  error: string | null;
  onClose: () => void;
  onCreate: (input: SprintWriteInput) => Promise<boolean>;
  onUpdate: (sprintId: string, input: SprintWriteInput) => Promise<boolean>;
  onDelete: (sprintId: string) => Promise<boolean>;
}

export function SprintManagerModal({ open, ...props }: SprintManagerModalProps) {
  useOverlayDepth(open);
  return (
    <ModalPortal>
      <AnimatePresence>{open && <SprintManagerContent {...props} />}</AnimatePresence>
    </ModalPortal>
  );
}

function addDays(date: string, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toLocaleDateString("sv-SE");
}

/** 다음 스프린트 기본값 — 마지막 스프린트 다음 날부터 2주. 스프린트가 없으면 오늘부터. */
function suggestNextSprint(sprints: Sprint[]): SprintWriteInput {
  const last = sprints[sprints.length - 1];
  const startDate = last ? addDays(last.endDate, 1) : todayString();
  const number = (last?.name.match(/(\d+)\s*$/)?.[1] ?? String(sprints.length)) as string;
  return {
    name: `스프린트 ${Number(number) + 1}`,
    startDate,
    endDate: addDays(startDate, SPRINT_LENGTH_DAYS - 1),
  };
}

function SprintManagerContent({ sprints, error, onClose, onCreate, onUpdate, onDelete }: Omit<SprintManagerModalProps, "open">) {
  const shouldReduceMotion = useReducedMotion();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SprintWriteInput>(() => suggestNextSprint(sprints));
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  useEscapeKey(onClose);

  function startEdit(sprint: Sprint) {
    setEditingId(sprint.id);
    setDraft({ name: sprint.name, startDate: sprint.startDate, endDate: sprint.endDate });
    setFormError(null);
  }

  function resetForm(nextSprints = sprints) {
    setEditingId(null);
    setDraft(suggestNextSprint(nextSprints));
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const name = draft.name.trim();
    if (!name || !draft.startDate || !draft.endDate) {
      setFormError("이름, 시작일, 종료일을 모두 입력하세요.");
      return;
    }
    if (draft.endDate < draft.startDate) {
      setFormError("종료일은 시작일과 같거나 그 뒤여야 합니다.");
      return;
    }
    setIsSubmitting(true);
    const input = { ...draft, name };
    const ok = editingId ? await onUpdate(editingId, input) : await onCreate(input);
    setIsSubmitting(false);
    if (ok) resetForm(editingId ? sprints : [...sprints, { id: "", ...input }]);
  }

  async function handleDelete(sprintId: string) {
    const ok = await onDelete(sprintId);
    setConfirmDeleteId(null);
    if (ok && editingId === sprintId) resetForm(sprints.filter((sprint) => sprint.id !== sprintId));
  }

  return (
    <>
      <motion.div
        key="sprint-backdrop"
        className="fixed inset-0 z-[60] bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={FADE}
        onClick={onClose}
      />

      <motion.div
        key="sprint-panel"
        className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center p-4"
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, transition: SPRING.exit }}
        transition={SPRING.modal}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="스프린트 관리"
          className="pointer-events-auto flex max-h-[85vh] w-full max-w-lg flex-col rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-zinc-800/60 px-6 py-4">
            <h2 className="text-base font-semibold text-zinc-50">스프린트 관리</h2>
            <button
              type="button"
              onClick={onClose}
              title="닫기"
              className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <ul className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
            {sprints.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-zinc-500">아직 스프린트가 없습니다. 아래에서 첫 스프린트를 만드세요.</li>
            )}
            {sprints.map((sprint) => {
              const daysLeft = daysLeftInSprint(sprint);
              const isRunning = daysLeft !== null && daysLeft > 0;
              return (
                <li
                  key={sprint.id}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                    editingId === sprint.id ? "bg-zinc-800/70" : "hover:bg-zinc-800/40"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                      <span className="truncate">{sprint.name}</span>
                      {isRunning && (
                        <span className="shrink-0 rounded-full bg-cyan-500/15 px-1.5 text-[11px] font-semibold text-cyan-300">
                          진행 중
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-zinc-500">{formatSprintRange(sprint)}</p>
                  </div>

                  {confirmDeleteId === sprint.id ? (
                    <div className="flex shrink-0 items-center gap-1.5 text-xs">
                      <span className="text-zinc-400">삭제할까요?</span>
                      <button
                        type="button"
                        onClick={() => handleDelete(sprint.id)}
                        className="rounded-lg bg-red-500/15 px-2 py-1 font-semibold text-red-400 transition-colors hover:bg-red-500/25"
                      >
                        삭제
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-lg px-2 py-1 text-zinc-400 transition-colors hover:bg-zinc-800"
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => startEdit(sprint)}
                        title="스프린트 수정"
                        className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(sprint.id)}
                        title="스프린트 삭제"
                        className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <form onSubmit={handleSubmit} className="space-y-3 border-t border-zinc-800/60 px-6 py-4">
            <p className="text-xs font-medium text-zinc-400">{editingId ? "스프린트 수정" : "새 스프린트"}</p>
            <input
              id="sprint-name"
              aria-label="스프린트 이름"
              value={draft.name}
              onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="예: 스프린트 16"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500 focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <DatePicker
                value={draft.startDate}
                onChange={(startDate) => setDraft((prev) => ({ ...prev, startDate }))}
                placeholder="시작일"
              />
              <DatePicker
                value={draft.endDate}
                onChange={(endDate) => setDraft((prev) => ({ ...prev, endDate }))}
                placeholder="종료일"
              />
            </div>
            {(formError ?? error) && <p className="text-xs text-red-400">{formError ?? error}</p>}
            <p className="text-[11px] text-zinc-600">스프린트를 삭제해도 작업은 지워지지 않고 백로그로 돌아갑니다.</p>
            <div className="flex justify-end gap-2">
              {editingId ? (
                <>
                  <button type="button" onClick={() => resetForm()} className={secondaryButton}>
                    취소
                  </button>
                  <button type="submit" disabled={isSubmitting} className={primaryButton}>
                    저장
                  </button>
                </>
              ) : (
                <button type="submit" disabled={isSubmitting} className={primaryButton}>
                  스프린트 추가
                </button>
              )}
            </div>
          </form>
        </div>
      </motion.div>
    </>
  );
}
