"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";

/**
 * 모달을 document.body에 붙인다. backdrop-blur나 transform이 걸린 조상 안에서는
 * position:fixed의 기준이 화면이 아니라 그 조상이 되어(사이드바가 그런 경우다)
 * 전체 화면 오버레이가 그 안에 갇힌다. 마운트 전에는 아무 것도 렌더링하지 않아
 * 서버 렌더와 첫 클라이언트 렌더가 어긋나지 않는다.
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  const hasMounted = useHasMounted();
  if (!hasMounted) return null;

  return createPortal(children, document.body);
}
