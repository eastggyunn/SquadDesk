"use client";

import { useEffect, useRef } from "react";

// 열린 순서대로 쌓아 두고, Esc는 맨 위(가장 나중에 열린) 창 하나만 닫는다 —
// 서랍 위에 삭제 확인 모달이 떠 있으면 모달만 닫히고 서랍은 남는다.
const stack: Array<{ current: () => void }> = [];

function handleKeyDown(event: KeyboardEvent) {
  // 달력·팝오버처럼 더 안쪽 요소가 이미 Esc를 처리했으면(preventDefault) 창은 그대로 둔다.
  if (event.key !== "Escape" || event.defaultPrevented) return;
  const top = stack[stack.length - 1];
  if (!top) return;
  event.preventDefault();
  top.current();
}

/** Esc 키를 누르면 onClose를 부른다. 여러 창이 겹쳐 있으면 가장 위의 창만 반응한다. */
export function useEscapeKey(onClose: () => void) {
  const handlerRef = useRef(onClose);
  handlerRef.current = onClose;

  useEffect(() => {
    const entry = handlerRef;
    stack.push(entry);
    if (stack.length === 1) window.addEventListener("keydown", handleKeyDown);
    return () => {
      stack.splice(stack.indexOf(entry), 1);
      if (stack.length === 0) window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
}
