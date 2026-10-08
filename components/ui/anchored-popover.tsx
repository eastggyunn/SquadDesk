"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { SPRING } from "@/lib/motion";

interface Coords {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

interface AnchoredPopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement>;
  placement?: "top" | "bottom";
  /** "end"면 트리거 오른쪽 끝에 맞춰 왼쪽으로 펼친다 — 화면 오른쪽 가장자리의 버튼용. */
  align?: "start" | "end";
  widthClassName?: string;
  children: ReactNode;
}

const GAP = 8;

export function AnchoredPopover({
  open,
  onClose,
  anchorRef,
  placement = "top",
  align = "start",
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

      const horizontal = align === "end" ? { right: window.innerWidth - rect.right } : { left: rect.left };
      if (placement === "top") {
        setCoords({ ...horizontal, bottom: window.innerHeight - rect.top + GAP });
      } else {
        setCoords({ ...horizontal, top: rect.bottom + GAP });
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

    // 팝오버 안쪽 목록을 스크롤할 때는 닫지 않는다 — 바깥(페이지)이 스크롤될 때만 위치가 어긋난다.
    function handleScroll(event: Event) {
      if (popoverRef.current?.contains(event.target as Node)) return;
      onClose();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", handleScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, placement, align]);

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
            right: coords.right,
            top: coords.top,
            bottom: coords.bottom,
            // 트리거 쪽에서 펼쳐지도록 — 위로 열리면 아래 가장자리, 아래로 열리면 위 가장자리가 기준.
            // 오른쪽 끝 정렬이면 가로 기준도 트리거가 있는 오른쪽 끝이다.
            transformOrigin: `${align === "end" ? "100%" : "50%"} ${placement === "top" ? "100%" : "0%"}`,
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
