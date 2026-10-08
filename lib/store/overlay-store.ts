"use client";

import { useEffect } from "react";
import { create } from "zustand";

interface OverlayState {
  /** 지금 열려 있는 모달·서랍 수. 0보다 크면 뒤 화면이 살짝 물러난다. */
  openCount: number;
  push: () => void;
  pop: () => void;
}

export const useOverlayStore = create<OverlayState>()((set) => ({
  openCount: 0,
  push: () => set((state) => ({ openCount: state.openCount + 1 })),
  pop: () => set((state) => ({ openCount: Math.max(0, state.openCount - 1) })),
}));

/** 모달·서랍이 열려 있는 동안 뒤 화면의 깊이 효과를 켠다. 닫히는 순간 바로 돌아오도록 open 값에 묶는다. */
export function useOverlayDepth(open: boolean) {
  const push = useOverlayStore((state) => state.push);
  const pop = useOverlayStore((state) => state.pop);

  useEffect(() => {
    if (!open) return;
    push();
    return pop;
  }, [open, push, pop]);
}
