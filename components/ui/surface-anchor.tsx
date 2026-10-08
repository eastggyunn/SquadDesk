"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { SPRING, expandedContentTransition } from "@/lib/motion";

/**
 * 칸반 카드처럼 자체 배경 요소가 없는 항목(표 행·일정 막대)을 서랍과 잇는 감싸개.
 *
 * 칸반 카드는 배경(서랍과 layoutId 공유)과 내용이 따로 있어서, 닫힐 때 배경이 서랍 자리에서
 * 카드로 줄어드는 모습이 보이고 내용은 그 뒤에 나타난다. 표 행·막대도 똑같이 보이도록
 * - 배경: 평소엔 투명, 서랍이 열려 있는 동안과 되돌아오는 동안만 서랍과 같은 배경으로 보인다.
 * - 내용(children): 열려 있는 동안 사라졌다가, 닫히면 칸반 카드 내용과 같은 타이밍에 돌아온다.
 * 배경을 내용 바깥 형제로 두어, 내용이 사라질 때 배경까지 같이 사라지지 않게 한다.
 */
export function SurfaceAnchor({
  layoutId,
  radius,
  isExpanded,
  className = "",
  children,
}: {
  layoutId: string;
  radius: number;
  isExpanded: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`relative ${className}`}>
      {/* 바깥: framer가 위치·크기·곡률을 맞추는 공유 레이아웃 요소. 안쪽 배경은 이 둥근 틀에 잘린다. */}
      <motion.span
        aria-hidden="true"
        layoutId={layoutId}
        transition={SPRING.sheet}
        style={{ borderRadius: radius }}
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <span
          className="absolute inset-0 border border-zinc-800 bg-zinc-900"
          // 열려 있는 동안 보이고, 닫힌 뒤에는 서랍 자리에서 돌아오는 동안 남아 있다가 사라진다.
          style={{ opacity: isExpanded ? 1 : 0, transition: isExpanded ? "none" : "opacity 200ms ease-out 300ms" }}
        />
      </motion.span>
      {/* 내용 페이드는 칸반 카드 내용과 같은 framer 애니메이션·같은 타이밍이다. */}
      <motion.div
        className="relative"
        initial={false}
        animate={{ opacity: isExpanded ? 0 : 1 }}
        transition={expandedContentTransition(isExpanded)}
      >
        {children}
      </motion.div>
    </div>
  );
}
