"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FADE, SPRING } from "@/lib/motion";
import { useOverlayDepth } from "@/lib/store/overlay-store";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";
import { ModalPortal } from "./modal-portal";

const PANEL_RADIUS = 24;

interface SlideOverPanelProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  widthClassName?: string;
  ariaLabel?: string;
  /**
   * 기존 항목(칸반 카드·표 행·일정 막대)을 열 때 그 항목 배경과 공유하는 layoutId
   * (lib/motion.ts의 surfaceLayoutId). 주면 항목 배경이 서랍 배경으로 이어지고, 없으면(새로 만들기)
   * 오른쪽에서 미끄러져 들어온다.
   */
  originLayoutId?: string;
}

export function SlideOverPanel({
  open,
  onClose,
  children,
  widthClassName = "max-w-[520px]",
  ariaLabel,
  originLayoutId,
}: SlideOverPanelProps) {
  useOverlayDepth(open);

  // body로 포털한다 — 뒤 화면(DepthContainer)이 물러날 때 서랍까지 같이 작아지지 않게.
  return (
    <ModalPortal>
      <AnimatePresence>
        {open && (
          <SlideOverPanelContent
            onClose={onClose}
            widthClassName={widthClassName}
            ariaLabel={ariaLabel}
            originLayoutId={originLayoutId}
          >
            {children}
          </SlideOverPanelContent>
        )}
      </AnimatePresence>
    </ModalPortal>
  );
}

function SlideOverPanelContent({
  onClose,
  children,
  widthClassName,
  ariaLabel,
  originLayoutId,
}: Omit<SlideOverPanelProps, "open">) {
  const shouldReduceMotion = useReducedMotion();
  const morphs = Boolean(originLayoutId) && !shouldReduceMotion;
  useEscapeKey(onClose);

  const presence = shouldReduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : morphs
      ? // 배경(layoutId)이 항목에서 이어지므로 서랍 틀은 제자리에 두고, 닫을 때는 함께 사라진다.
        { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 0, transition: SPRING.exit } }
      : {
          initial: { x: "calc(100% + 1.5rem)" },
          animate: { x: 0 },
          exit: { x: "calc(100% + 1.5rem)", transition: SPRING.exit },
        };

  return (
    <>
      <motion.div
        key="slide-over-backdrop"
        className="fixed inset-0 z-50 bg-black/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={FADE}
        onClick={onClose}
      />

      <motion.div
        key="slide-over-panel"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={`fixed bottom-3 right-3 top-3 z-50 flex w-[calc(100%-1.5rem)] ${widthClassName} flex-col`}
        {...presence}
        transition={SPRING.sheet}
      >
        {/* 서랍 배경. 항목 배경과 layoutId를 공유하면 항목 배경이 그대로 서랍 배경이 된다. */}
        <motion.div
          layoutId={morphs ? originLayoutId : undefined}
          transition={SPRING.sheet}
          style={{ borderRadius: PANEL_RADIUS }}
          className="absolute inset-0 border border-zinc-800 bg-zinc-900 shadow-2xl"
        />

        <motion.div
          className="relative flex-1 overflow-y-auto rounded-3xl p-6"
          initial={morphs ? { opacity: 0 } : false}
          animate={{ opacity: 1, transition: morphs ? { duration: 0.2, delay: 0.14 } : { duration: 0 } }}
          exit={morphs ? { opacity: 0, transition: { duration: 0.08 } } : undefined}
        >
          {children}
        </motion.div>
      </motion.div>
    </>
  );
}
