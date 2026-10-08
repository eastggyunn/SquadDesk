"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { primaryButton, secondaryButton } from "@/components/ui/button-styles";
import { FADE, SPRING } from "@/lib/motion";
import { useOverlayDepth } from "@/lib/store/overlay-store";
import { ModalPortal } from "@/components/ui/modal-portal";

interface ConfirmMoveModalProps {
  open: boolean;
  targetLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmMoveModal({ open, targetLabel, onCancel, onConfirm }: ConfirmMoveModalProps) {
  useOverlayDepth(open);
  return (
    <ModalPortal>
      <AnimatePresence>
        {open && <ConfirmMoveModalContent targetLabel={targetLabel} onCancel={onCancel} onConfirm={onConfirm} />}
      </AnimatePresence>
    </ModalPortal>
  );
}

function ConfirmMoveModalContent({
  targetLabel,
  onCancel,
  onConfirm,
}: Omit<ConfirmMoveModalProps, "open">) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <>
      <motion.div
        key="confirm-backdrop"
        className="fixed inset-0 z-[60] bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={FADE}
        onClick={onCancel}
      />

      <motion.div
        key="confirm-panel"
        className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, transition: SPRING.exit }}
        transition={SPRING.modal}
      >
        <div
          role="alertdialog"
          aria-modal="true"
          className="w-full max-w-xs rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-center shadow-2xl"
        >
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-400">
            <ArrowRight className="h-5 w-5" />
          </span>
          <p className="mt-3 text-sm text-zinc-200">
            정말로 <span className="font-semibold text-zinc-50">{targetLabel}</span> 단계로
            이동하시겠습니까?
          </p>

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
              className={`flex-1 ${primaryButton}`}
            >
              확인
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}
