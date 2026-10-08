"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Archive } from "lucide-react";
import { ModalPortal } from "@/components/ui/modal-portal";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";
import { withObjectParticle } from "@/lib/format";
import { secondaryButton } from "@/components/ui/button-styles";
import { FADE, SPRING } from "@/lib/motion";
import { useOverlayDepth } from "@/lib/store/overlay-store";

/** "danger"는 되돌릴 수 없는 삭제(기본값), "neutral"은 되돌릴 수 있는 동작(예: 채널 보관)의 시각 언어를 쓴다. */
type ConfirmTone = "danger" | "neutral";

interface DeleteConfirmModalProps {
  open: boolean;
  itemLabel?: string;
  /** 기본 삭제 문구 대신 쓸 안내 문구(예: 보관 동작). 주어지면 itemLabel 기반 기본 문구 대신 이 문구를 그대로 쓴다. */
  description?: string;
  /** 기본 "삭제된 데이터는 복구할 수 없습니다." 대신 쓸 보조 설명. */
  helperText?: string;
  /** 기본 "삭제" 버튼 라벨 대신 쓸 확인 버튼 라벨. */
  confirmLabel?: string;
  tone?: ConfirmTone;
  /** true면 확인 버튼을 비활성화하고 라벨을 "삭제 중..."으로 바꾼다 — 연타로 인한 중복 실행 방지용. */
  isConfirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const TONE_STYLES: Record<ConfirmTone, { panel: string; icon: string; iconWrap: string; confirmButton: string }> = {
  danger: {
    panel: "border-red-500/30",
    icon: "text-red-400",
    iconWrap: "bg-red-500/15",
    confirmButton: "bg-red-500 text-zinc-50 hover:bg-red-400",
  },
  neutral: {
    panel: "border-zinc-700",
    icon: "text-cyan-400",
    iconWrap: "bg-cyan-500/15",
    confirmButton: "bg-cyan-500 text-zinc-950 hover:bg-cyan-400",
  },
};

export function DeleteConfirmModal({
  open,
  itemLabel = "이 작업",
  description,
  helperText = "삭제된 데이터는 복구할 수 없습니다.",
  confirmLabel = "삭제",
  tone = "danger",
  isConfirming = false,
  onCancel,
  onConfirm,
}: DeleteConfirmModalProps) {
  useOverlayDepth(open);
  return (
    <ModalPortal>
      <AnimatePresence>
        {open && (
          <DeleteConfirmModalContent
            description={description ?? `정말로 ${withObjectParticle(itemLabel)} 삭제하시겠습니까?`}
            helperText={helperText}
            confirmLabel={confirmLabel}
            tone={tone}
            isConfirming={isConfirming}
            onCancel={onCancel}
            onConfirm={onConfirm}
          />
        )}
      </AnimatePresence>
    </ModalPortal>
  );
}

function DeleteConfirmModalContent({
  description,
  helperText,
  confirmLabel,
  tone,
  isConfirming,
  onCancel,
  onConfirm,
}: {
  description: string;
  helperText: string;
  confirmLabel: string;
  tone: ConfirmTone;
  isConfirming: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const shouldReduceMotion = useReducedMotion();
  const styles = TONE_STYLES[tone];
  const Icon = tone === "neutral" ? Archive : AlertTriangle;
  useEscapeKey(onCancel);

  return (
    <>
      <motion.div
        key="delete-confirm-backdrop"
        className="fixed inset-0 z-[70] bg-black/70"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={FADE}
        onClick={onCancel}
      />

      <motion.div
        key="delete-confirm-panel"
        className="fixed inset-0 z-[70] flex items-center justify-center p-4"
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, transition: SPRING.exit }}
        transition={SPRING.modal}
        onClick={onCancel}
      >
        <div
          role="alertdialog"
          aria-modal="true"
          onClick={(event) => event.stopPropagation()}
          className={`w-full max-w-sm rounded-xl border bg-zinc-900 p-5 text-center shadow-2xl ${styles.panel}`}
        >
          <span
            className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full ${styles.iconWrap} ${styles.icon}`}
          >
            <Icon className="h-5 w-5" />
          </span>
          <p className="mt-3 text-sm text-zinc-200">{description}</p>
          <p className="mt-1 text-xs text-zinc-500">{helperText}</p>

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className={`flex-1 ${secondaryButton}`}
            >
              취소
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isConfirming}
              className={`flex-1 rounded-md py-2 text-sm font-semibold transition-[transform,opacity] duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 ${styles.confirmButton}`}
            >
              {isConfirming ? "삭제 중..." : confirmLabel}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}
