"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { SPRING } from "@/lib/motion";

interface Coords {
  left: number;
  top?: number;
  bottom?: number;
}

interface AnchoredPopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement>;
  placement?: "top" | "bottom";
  widthClassName?: string;
  children: ReactNode;
}

const GAP = 8;

export function AnchoredPopover({
  open,
  onClose,
  anchorRef,
  placement = "top",
  widthClassName = "w-64",
  children,
}: AnchoredPopoverProps) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;

      if (placement === "top") {
        setCoords({ left: rect.left, bottom: window.innerHeight - rect.top + GAP });
      } else {
        setCoords({ left: rect.left, top: rect.bottom + GAP });
      }
    }

    updatePosition();

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault(); // 팝오버만 닫고, 바깥 서랍·모달은 남긴다(useEscapeKey가 확인한다).
        onClose();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, placement]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && coords && (
        <motion.div
          ref={popoverRef}
          initial={{ opacity: 0, scale: 0.95, y: placement === "top" ? 6 : -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: placement === "top" ? 6 : -6, transition: SPRING.exit }}
          transition={SPRING.popover}
          style={{
            position: "fixed",
            left: coords.left,
            top: coords.top,
            bottom: coords.bottom,
            // 트리거 쪽에서 펼쳐지도록 — 위로 열리면 아래 가장자리, 아래로 열리면 위 가장자리가 기준.
            transformOrigin: placement === "top" ? "50% 100%" : "50% 0%",
          }}
          className={`z-[80] ${widthClassName} rounded-xl border border-zinc-700 bg-zinc-900 p-3 shadow-2xl`}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
