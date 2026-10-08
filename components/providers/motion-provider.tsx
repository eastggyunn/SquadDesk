"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/** 시스템의 '동작 줄이기'를 켠 사용자에게는 이동·크기 애니메이션을 끄고 투명도만 남긴다. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
