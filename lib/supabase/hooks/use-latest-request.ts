"use client";

import { useCallback, useEffect, useRef } from "react";

export interface LatestRequest {
  /** false면 더 최근 요청이 이미 시작됐다(또는 언마운트됐다) — 이 응답은 버린다. */
  isCurrent: () => boolean;
  /** 다음 beginRequest() 호출이나 언마운트 시 abort된다. withAbortSignal()로 조회에 붙인다. */
  signal: AbortSignal;
}

/**
 * 프로젝트를 빠르게 연속 전환하면 먼저 보낸 조회가 나중에 도착해 지금 프로젝트의 상태를
 * 덮어쓸 수 있다. beginRequest()를 요청 시작 시(projectId가 null인 분기보다도 먼저) 호출하고,
 * isCurrent()가 false면 그 응답은 버린다. 새 요청을 시작하면 이전 요청의 signal이 abort되어
 * 실제 네트워크 요청도 취소된다(signal을 쓰지 않는 호출부는 무시만 된다).
 */
export function useLatestRequest(): () => LatestRequest {
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      generation.current += 1;
      controller.current?.abort();
    },
    []
  );

  return useCallback(() => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    const id = ++generation.current;
    return { isCurrent: () => id === generation.current, signal: current.signal };
  }, []);
}
