"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { SPRING } from "@/lib/motion";

// Select(드롭다운)와 Combobox(입력 + 추천 목록)가 같은 모양·동작의 떠 있는 목록을 쓰도록 모은 부분.

const GAP = 6;
const MAX_LIST_HEIGHT = 280;
const ESTIMATED_ITEM_HEIGHT = 40;

export const FLOATING_LIST_CLASSNAME =
  "z-[90] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900/95 p-1 shadow-2xl backdrop-blur-xl";

export function floatingOptionClassName(isActive: boolean, isDisabled = false) {
  return `flex cursor-pointer items-center justify-between gap-3 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm ${
    isDisabled ? "cursor-default text-zinc-600" : isActive ? "bg-zinc-800 text-zinc-50" : "text-zinc-300"
  }`;
}

interface FloatingPosition {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  openUp: boolean;
}

/**
 * 기준 요소(anchor) 바로 아래에 목록 자리를 잡고(공간이 모자라면 위로), 바깥을 누르거나
 * 바깥이 스크롤되거나 창 크기가 바뀌면 onClose를 부른다. 반환값을 motion.ul에 그대로 펼친다.
 */
export function useFloatingList({
  isOpen,
  anchorRef,
  itemCount,
  onClose,
}: {
  isOpen: boolean;
  anchorRef: RefObject<HTMLElement>;
  itemCount: number;
  onClose: () => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const [position, setPosition] = useState<FloatingPosition | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!isOpen) return;
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom;
    const needed = Math.min(MAX_LIST_HEIGHT, itemCount * ESTIMATED_ITEM_HEIGHT + 8);
    const openUp = spaceBelow < needed && rect.top > spaceBelow;
    setPosition({
      left: rect.left,
      width: rect.width,
      openUp,
      ...(openUp ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP }),
    });
  }, [isOpen, itemCount, anchorRef]);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || listRef.current?.contains(target)) return;
      onCloseRef.current();
    }
    // 목록이 기준 요소에서 떨어져 떠 보이지 않도록 바깥이 움직이면 닫는다(목록 안 스크롤은 제외).
    function handleScroll(event: Event) {
      if (listRef.current?.contains(event.target as Node)) return;
      onCloseRef.current();
    }
    function handleResize() {
      onCloseRef.current();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [isOpen, anchorRef]);

  const motionProps = position
    ? {
        initial: { opacity: 0, scale: 0.96, y: position.openUp ? 4 : -4 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.96, transition: SPRING.exit },
        transition: SPRING.popover,
        style: {
          position: "fixed",
          left: position.left,
          top: position.top,
          bottom: position.bottom,
          minWidth: position.width,
          maxHeight: MAX_LIST_HEIGHT,
          transformOrigin: position.openUp ? "50% 100%" : "50% 0%",
        } satisfies CSSProperties,
      }
    : null;

  return { listRef, motionProps };
}

/** 키보드로 고르는 항목이 목록 밖으로 나가지 않게 따라 스크롤한다. */
export function useScrollActiveIntoView(isOpen: boolean, activeElementId: string | null) {
  useEffect(() => {
    if (!isOpen || !activeElementId) return;
    document.getElementById(activeElementId)?.scrollIntoView({ block: "nearest" });
  }, [isOpen, activeElementId]);
}
