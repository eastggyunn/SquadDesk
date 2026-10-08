"use client";

import { useSyncExternalStore } from "react";

const subscribeNever = () => () => {};

/**
 * hydration 렌더(서버 HTML과 맞춰야 하는 첫 클라이언트 렌더)에서만 false다.
 * 클라이언트 이동으로 새로 마운트될 때는 첫 렌더부터 true라 빈 화면이 한 번 끼지 않는다.
 */
export function useHasMounted() {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}
