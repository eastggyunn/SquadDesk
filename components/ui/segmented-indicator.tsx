"use client";

import { motion } from "framer-motion";
import { SPRING } from "@/lib/motion";

/**
 * 토글 묶음에서 선택된 칸 뒤에 깔리는 배경. 같은 묶음 안에서는 layoutId가 같아서
 * 선택을 바꾸면 배경이 새 칸으로 미끄러져 간다. 선택된 버튼 안에서만 렌더링한다.
 */
export function SegmentedIndicator({ layoutId }: { layoutId: string }) {
  return (
    <motion.span
      layoutId={layoutId}
      transition={SPRING.popover}
      style={{ borderRadius: 8 }}
      className="absolute inset-0 border border-zinc-700 bg-zinc-800"
    />
  );
}
