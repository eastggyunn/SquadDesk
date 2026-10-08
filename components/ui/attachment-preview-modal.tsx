"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, Loader2, X } from "lucide-react";
import { ModalPortal } from "./modal-portal";
import { useSignedPreviewUrl } from "@/lib/hooks/use-signed-preview-url";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";
import { FADE, SPRING } from "@/lib/motion";
import { useOverlayDepth } from "@/lib/store/overlay-store";

interface AttachmentPreviewModalProps {
  open: boolean;
  fileName: string;
  /**
   * signed URL을 반환하는 함수. null이면(예: 로컬 데모 모드의 목업 첨부처럼
   * 실제 파일이 없는 경우) 조회를 시도하지 않고 곧바로 "미리보기를 사용할 수
   * 없습니다"를 보여준다.
   */
  resolveUrl: (() => Promise<string>) | null;
  onClose: () => void;
}

/**
 * 작업·버그·채팅 첨부와 대시보드 통합 에셋(현재 버전·버전 이력·비교)이 공유하는
 * 이미지 미리보기 모달. document.body로 포털되고, Esc·바깥 클릭·닫기 버튼으로
 * 닫힌다. signed URL은 이 컴포넌트가 열려 있는 동안만 화면 상태로 존재한다.
 *
 * z-[80]을 쓴다 — 버전 이력 모달(z-[70]) 안에서도 열릴 수 있어, 일반 모달보다
 * 한 단계 위에서 항상 그 위에 그려지게 한다(AnchoredPopover와 같은 상위 티어).
 */
export function AttachmentPreviewModal({ open, fileName, resolveUrl, onClose }: AttachmentPreviewModalProps) {
  useOverlayDepth(open);
  return (
    <ModalPortal>
      <AnimatePresence>
        {open && <AttachmentPreviewModalContent fileName={fileName} resolveUrl={resolveUrl} onClose={onClose} />}
      </AnimatePresence>
    </ModalPortal>
  );
}

function AttachmentPreviewModalContent({
  fileName,
  resolveUrl,
  onClose,
}: Omit<AttachmentPreviewModalProps, "open">) {
  const shouldReduceMotion = useReducedMotion();
  const state = useSignedPreviewUrl(resolveUrl);
  useEscapeKey(onClose);

  return (
    <>
      <motion.div
        key="attachment-preview-backdrop"
        className="fixed inset-0 z-[80] bg-black/80"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={FADE}
        onClick={onClose}
      />

      <motion.div
        key="attachment-preview-panel"
        className="fixed inset-0 z-[80] flex items-center justify-center p-4"
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, transition: SPRING.exit }}
        transition={SPRING.modal}
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={fileName}
          onClick={(event) => event.stopPropagation()}
          className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
            <p className="min-w-0 truncate text-sm font-medium text-zinc-200" title={fileName}>
              {fileName}
            </p>
            <button
              type="button"
              onClick={onClose}
              title="닫기"
              className="shrink-0 rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex min-h-[240px] flex-1 items-center justify-center overflow-auto bg-zinc-950/60 p-4">
            <PreviewBody state={state} fileName={fileName} />
          </div>
        </div>
      </motion.div>
    </>
  );
}

function PreviewBody({ state, fileName }: { state: ReturnType<typeof useSignedPreviewUrl>; fileName: string }) {
  if (state.status === "loading") {
    return (
      <p className="flex items-center gap-2 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        불러오는 중입니다...
      </p>
    );
  }
  if (state.status === "error" || state.status === "unavailable") {
    return (
      <p className="flex items-center gap-2 text-sm text-zinc-500">
        <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
        {state.message}
      </p>
    );
  }
  return (
    <img
      src={state.url}
      alt={fileName}
      className="max-h-[75vh] max-w-full rounded object-contain"
    />
  );
}
