import { useSyncExternalStore } from "react";

/**
 * 진행 중인 첨부 업로드의 진행률(attachment id → 0~100 정수 %). uploadAttachment가
 * 쓰고, 화면(작업/버그 폼, 채팅 칩)이 id별로 구독한다. 업로드 경로(폼 제출 →
 * syncAttachments, 채팅 runUpload 등)마다 콜백을 실어 나르지 않으려고 모듈 단위
 * 저장소로 둔다 — 첨부 id는 업로드 전에 클라이언트가 이미 만들어 둔 값이다.
 * 정수 %로 반올림해 저장하므로 구독자는 1% 단위로만 다시 렌더된다.
 */
const percentById = new Map<string, number>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function reportUploadProgress(attachmentId: string, fraction: number) {
  const percent = Math.min(100, Math.max(0, Math.floor(fraction * 100)));
  if (percentById.get(attachmentId) === percent) return;
  percentById.set(attachmentId, percent);
  emit();
}

export function clearUploadProgress(attachmentId: string) {
  if (percentById.delete(attachmentId)) emit();
}

/** 업로드 중이 아니면 null. */
export function useUploadProgress(attachmentId: string): number | null {
  return useSyncExternalStore(
    subscribe,
    () => percentById.get(attachmentId) ?? null,
    () => null
  );
}
