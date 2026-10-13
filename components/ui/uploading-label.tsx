"use client";

import { useEffect } from "react";
import { clearUploadProgress, useUploadProgress } from "@/lib/upload-progress";

/** "업로드 중 37%" — 진행률을 아직 모르면(업로드 시작 전) "업로드 중..." */
export function UploadingLabel({ attachmentId }: { attachmentId: string }) {
  const percent = useUploadProgress(attachmentId);
  // 성공한 업로드는 100%로 남겨 두므로(uploadAttachment 참고), 표시가 사라질 때 정리한다.
  useEffect(() => () => clearUploadProgress(attachmentId), [attachmentId]);
  return <span className="tabular-nums">{percent === null ? "업로드 중..." : `업로드 중 ${percent}%`}</span>;
}
