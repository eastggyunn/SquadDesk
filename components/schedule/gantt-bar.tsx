"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { BarLayout } from "./gantt-utils";
import { SPRING } from "@/lib/motion";
import { SurfaceAnchor } from "@/components/ui/surface-anchor";

interface GanttBarProps {
  layout: BarLayout;
  colorClassName: string;
  /** 서랍 배경과 공유하는 layoutId(surfaceLayoutId) — 칸반 카드와 같은 방식으로 막대에서 서랍이 이어진다. */
  surfaceLayoutId: string;
  /** 이 막대의 작업이 지금 서랍으로 열려 있는지 — 열린 동안 막대가 잠시 사라진다. */
  isExpanded: boolean;
  onClick: () => void;
}

export function GanttBar({ layout, colorClassName, surfaceLayoutId, isExpanded, onClick }: GanttBarProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  function handleMouseEnter() {
    const rect = barRef.current?.getBoundingClientRect();
    if (rect) {
      setTooltipPos({ left: rect.left + rect.width / 2, top: rect.top });
    }
    setIsHovered(true);
  }

  return (
    <div
      className="absolute inset-y-0 flex items-center"
      style={{ left: layout.left, width: layout.width }}
    >
      <SurfaceAnchor layoutId={surfaceLayoutId} radius={12} isExpanded={isExpanded} className="w-full">
      <motion.div
        ref={barRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setIsHovered(false)}
        onClick={onClick}
        whileHover={{ scale: 1.06 }}
        transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
        className={`h-6 w-full cursor-pointer rounded-full shadow-sm ${colorClassName}`}
      />
      </SurfaceAnchor>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isHovered && tooltipPos && (
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.95 }}
                transition={SPRING.popover}
                style={{
                  position: "fixed",
                  left: tooltipPos.left,
                  top: tooltipPos.top,
                  transform: "translate(-50%, calc(-100% - 10px))",
                }}
                className="pointer-events-none z-50 whitespace-nowrap rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs shadow-xl"
              >
                <p className="font-semibold text-zinc-50">{layout.title}</p>
                <p className="mt-0.5 text-zinc-400">{layout.rangeLabel}</p>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
