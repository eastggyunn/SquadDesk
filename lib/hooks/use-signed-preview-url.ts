"use client";

import { useEffect, useState } from "react";

export type PreviewState =
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "error"; message: string }
  | { status: "unavailable"; message: string };

const UNAVAILABLE_MESSAGE = "미리보기를 사용할 수 없습니다.";

/**
 * signed URL을 지연 조회하고 loading/ready/error/unavailable 상태로 노출한다.
 * AttachmentPreviewModal(단일 미리보기)과 에셋 버전 비교(두 장 동시)가 공유한다.
 *
 * resolveUrl이 null이면(예: 로컬 데모 모드처럼 애초에 미리볼 실 파일이 없는 경우)
 * 네트워크 요청 자체를 시도하지 않고 곧바로 "미리보기를 사용할 수 없습니다"로
 * 확정한다 — 존재하지 않는 파일을 억지로 미리보기하지 않기 위해서다.
 *
 * 반환된 signed URL은 이 훅의 컴포넌트 상태로만 존재하고 언마운트되면 함께
 * 사라진다 — localStorage나 DB에는 저장하지 않는다.
 *
 * resolveUrl은 이 훅을 쓰는 컴포넌트가 열려 있는 동안 가리키는 대상(어떤 첨부/
 * 버전인지)이 바뀌지 않는다는 전제로, 마운트 시 한 번만 실행한다 — 대상이
 * 바뀌면 그 모달 자체가 새로 마운트된다(AnimatePresence의 조건부 렌더).
 */
export function useSignedPreviewUrl(resolveUrl: (() => Promise<string>) | null): PreviewState {
  const [state, setState] = useState<PreviewState>(
    resolveUrl ? { status: "loading" } : { status: "unavailable", message: UNAVAILABLE_MESSAGE }
  );

  useEffect(() => {
    if (!resolveUrl) return;
    let cancelled = false;

    resolveUrl()
      .then((url) => {
        if (!cancelled) setState({ status: "ready", url });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ status: "error", message: err instanceof Error ? err.message : "미리보기를 불러오지 못했습니다." });
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 1회만: 대상이 바뀌면 컴포넌트 자체가 새로 마운트된다.
  }, []);

  return state;
}
