import type { Transition } from "framer-motion";

/**
 * 앱 전체 모션 프리셋 — 시간+곡선 대신 스프링을 쓴다(iOS 방식).
 * 스프링은 도중에 목표가 바뀌어도 현재 속도를 이어받아 끊기지 않는다.
 * visualDuration = 눈에 보이는 도착 시간, bounce = 튕김(0이면 없음).
 * 새 모션은 여기서 고르고, 값을 화면마다 따로 만들지 않는다.
 */
export const SPRING = {
  /** 서랍·시트 — 묵직하게 미끄러져 들어와 거의 튕기지 않고 멈춘다. */
  sheet: { type: "spring", visualDuration: 0.42, bounce: 0.08 },
  /** 가운데 모달 — 살짝 커지며 톡 자리 잡는다. */
  modal: { type: "spring", visualDuration: 0.32, bounce: 0.18 },
  /** 팝오버·달력·드롭다운 — 누른 버튼 쪽에서 빠르게 펼쳐진다. */
  popover: { type: "spring", visualDuration: 0.24, bounce: 0.12 },
  /** 높이·너비가 바뀌는 접기/펼치기 — 튕기면 주변 레이아웃이 흔들리므로 bounce 0. */
  collapse: { type: "spring", visualDuration: 0.3, bounce: 0 },
  /** 닫힘 — 열림보다 짧고 튕김 없이 사라진다. */
  exit: { type: "spring", visualDuration: 0.22, bounce: 0 },
} as const satisfies Record<string, Transition>;

/** 배경 딤처럼 투명도만 바뀌는 요소. */
export const FADE = { duration: 0.2, ease: "easeOut" } as const satisfies Transition;

/**
 * 뒤 화면 깊이 효과(DepthContainer) 전용 CSS 전환. 화면 전체를 움직이므로 GPU에서 도는
 * CSS transition을 쓴다. 곡선은 iOS 시트 곡선 — 튕김 없는 스프링과 같은 느낌이다.
 */
export const DEPTH_CSS_TRANSITION = "transform 450ms cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * 기존 항목(칸반 카드·표 행·일정 막대)의 배경과 그 항목을 여는 서랍(SlideOverPanel originLayoutId)
 * 배경이 공유하는 layoutId. 칸반 카드에서 시작한 전환 방식을 모든 화면이 똑같이 쓴다.
 */
export function surfaceLayoutId(kind: "task" | "bug", id: string) {
  return `${kind}-surface-${id}`;
}

/**
 * 서랍으로 열려 있는 항목(칸반 카드·표 행·일정 막대)의 내용 페이드 타이밍(framer transition):
 * 열 때 0.08초 만에 사라지고, 닫으면 0.15초 뒤 0.2초에 걸쳐 돌아온다. 모든 항목이 이 값을 공유한다.
 */
export function expandedContentTransition(isExpanded: boolean): Transition {
  return isExpanded ? { duration: 0.08 } : { duration: 0.2, delay: 0.15 };
}
