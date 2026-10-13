"use client";

import { useUploadProgress } from "@/lib/upload-progress";

/** "업로드 중 37%" — 진행률을 아직 모르면(업로드 시작 전) "업로드 중..." */
export function UploadingLabel({ attachmentId }: { attachmentId: string }) {
  const percent = useUploadProgress(attachmentId);
  return <span className="tabular-nums">{percent === null ? "업로드 중..." : `업로드 중 ${percent}%`}</span>;
}
