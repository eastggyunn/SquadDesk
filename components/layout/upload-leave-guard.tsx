"use client";

import { useEffect } from "react";
import { hasActiveUploads } from "@/lib/upload-progress";

/**
 * 첨부 업로드가 진행 중일 때 새로고침·탭 닫기·전체 페이지 이동을 하려 하면 브라우저의
 * "사이트에서 나가시겠습니까?" 확인을 띄운다. 페이지가 떠나면 업로드가 끊겨 첨부 없는
 * 메시지/작업이 남기 때문이다. 앱 안의 이동(Next 링크)은 페이지가 그대로라 업로드가
 * 계속되므로 막지 않는다. 문구는 브라우저가 정해서 바꿀 수 없다.
 */
export function UploadLeaveGuard() {
  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!hasActiveUploads()) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return null;
}
