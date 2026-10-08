// 버튼 스타일 단일 출처 — 화면마다 조금씩 달랐던 primary/secondary 버튼을 여기로 모은다.
const BASE =
  "inline-flex items-center justify-center gap-1.5 font-semibold transition-[transform,background-color,color,opacity] duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100";

/** 화면 상단 "+ 추가" 같은 주요 액션, 폼 제출. */
export const primaryButton = `${BASE} rounded-xl bg-cyan-500 px-4 py-2 text-sm text-zinc-950 hover:bg-cyan-400 disabled:hover:bg-cyan-500`;

/** 인라인 입력 옆 "추가", 작은 카드 안 액션. */
export const primaryButtonSm = `${BASE} rounded-lg bg-cyan-500 px-3 py-1.5 text-xs text-zinc-950 hover:bg-cyan-400 disabled:hover:bg-cyan-500`;

/** 취소 등 보조 액션. */
export const secondaryButton = `${BASE} rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100`;

/** 칸반 우선순위 필터, 일정 보기 단위처럼 여러 개 중 하나를 고르는 토글 묶음. */
export const segmentedGroup = "flex w-fit items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900/40 p-1";
export const segmentedItem =
  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-[transform,background-color,color,border-color] duration-150 active:scale-95";

/** 툴바 안의 작은 보조 액션(예: "스프린트 관리"). */
export const secondaryButtonSm = `${BASE} rounded-xl border border-zinc-800 px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100`;
