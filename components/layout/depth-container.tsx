"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useOverlayStore } from "@/lib/store/overlay-store";
import { DEPTH_CSS_TRANSITION } from "@/lib/motion";

const DEPTH_SCALE = 0.985;
/** 닫힌 뒤 되돌아오는 전환이 끝날 때까지 GPU 레이어를 유지하는 시간(ms). */
const SETTLE_MS = 500;

/**
 * 모달·서랍이 열리면 앱 화면 전체가 살짝 작아지며 뒤로 물러난다(iOS 시트의 깊이감).
 *
 * framer 스프링 대신 CSS transition을 쓴다 — 화면 전체를 메인 스레드에서 매 프레임 다시
 * 그리면, 서랍 내용이 그려지는 같은 순간과 겹쳐 버벅인다. CSS transform 전환은 GPU
 * 합성 단계에서 돌아가 메인 스레드가 바빠도 끊기지 않는다. 전환 동안만 will-change로
 * 레이어를 미리 올려 두고, 쉴 때는 transform·will-change를 모두 걷어 sticky·fixed
 * 배치에 영향을 주지 않는다. 오버레이는 전부 document.body로 포털되어 이 변형 밖에 있다.
 */
export function DepthContainer({ children }: { children: ReactNode }) {
  const isOverlayOpen = useOverlayStore((state) => state.openCount > 0);
  const [isSettling, setIsSettling] = useState(false);

  useEffect(() => {
    if (isOverlayOpen) {
      setIsSettling(true);
      return;
    }
    const timer = window.setTimeout(() => setIsSettling(false), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [isOverlayOpen]);

  return (
    <div
      className="motion-reduce:!transform-none"
      style={{
        transform: isOverlayOpen ? `scale(${DEPTH_SCALE})` : isSettling ? "scale(1)" : undefined,
        transformOrigin: "50% 0%",
        transition: DEPTH_CSS_TRANSITION,
        willChange: isOverlayOpen || isSettling ? "transform" : undefined,
      }}
    >
      {children}
    </div>
  );
}
