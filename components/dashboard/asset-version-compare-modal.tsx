"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, Loader2, X } from "lucide-react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { createAttachmentPreviewUrl } from "@/lib/supabase/repositories/attachments";
import type { AssetSyncHistoryEntry } from "@/lib/supabase/repositories/synced-assets";
import { useSignedPreviewUrl } from "@/lib/hooks/use-signed-preview-url";
import { ModalPortal } from "@/components/ui/modal-portal";
import { formatRelativeTime } from "@/lib/format";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";
import { FADE, SPRING } from "@/lib/motion";
import { useOverlayDepth } from "@/lib/store/overlay-store";

interface AssetVersionCompareModalProps {
  open: boolean;
  entries: [AssetSyncHistoryEntry, AssetSyncHistoryEntry] | null;
  onBack: () => void;
  onClose: () => void;
}

/**
 * 버전 이력에서 고른 이미지 두 개를 좌우로 나란히 보여준다. 단순 비교만
 * 한다 — 서버에서 이미지를 합성하거나 차이를 계산하지 않고, 다운로드나
 * 원본 데이터 변경도 하지 않는다. 각 쪽은 독립적으로 signed URL을 조회하므로
 * 한쪽이 실패해도 다른 쪽은 그대로 보인다.
 */
export function AssetVersionCompareModal({ open, entries, onBack, onClose }: AssetVersionCompareModalProps) {
  useOverlayDepth(open);
  return (
    <ModalPortal>
      <AnimatePresence>
        {open && entries && <AssetVersionCompareModalContent entries={entries} onBack={onBack} onClose={onClose} />}
      </AnimatePresence>
    </ModalPortal>
  );
}

function AssetVersionCompareModalContent({
  entries,
  onBack,
  onClose,
}: Omit<AssetVersionCompareModalProps, "open"> & { entries: [AssetSyncHistoryEntry, AssetSyncHistoryEntry] }) {
  const shouldReduceMotion = useReducedMotion();
  useEscapeKey(onClose);

  return (
    <>
      <motion.div
        key="asset-compare-backdrop"
        className="fixed inset-0 z-[70] bg-black/80"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={FADE}
        onClick={onClose}
      />

      <motion.div
        key="asset-compare-panel"
        className="fixed inset-0 z-[70] flex items-center justify-center p-4"
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, transition: SPRING.exit }}
        transition={SPRING.modal}
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="버전 비교"
          onClick={(event) => event.stopPropagation()}
          className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onBack}
                className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
              >
                ← 목록으로
              </button>
              <span className="text-zinc-700">|</span>
              <h2 className="text-sm font-semibold text-zinc-100">버전 비교</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              title="닫기"
              className="shrink-0 rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid flex-1 grid-cols-1 divide-y divide-zinc-800 overflow-auto sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <ComparePane entry={entries[0]} />
            <ComparePane entry={entries[1]} />
          </div>
        </div>
      </motion.div>
    </>
  );
}

function ComparePane({ entry }: { entry: AssetSyncHistoryEntry }) {
  const attachment = entry.attachment;
  const resolveUrl =
    attachment?.storagePath
      ? async () => createAttachmentPreviewUrl(getBrowserSupabaseClient(), attachment.storagePath!)
      : null;
  const state = useSignedPreviewUrl(resolveUrl);

  return (
    <div className="flex min-h-[280px] flex-col">
      <div className="shrink-0 border-b border-zinc-800/60 bg-zinc-950/40 px-4 py-2.5">
        <p className="truncate text-sm font-medium text-zinc-200" title={attachment?.name}>
          {attachment?.name ?? "파일을 찾을 수 없음"}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-zinc-600">
          {entry.sourceLabel} · {formatRelativeTime(entry.createdAt)}
        </p>
      </div>
      <div className="flex flex-1 items-center justify-center bg-zinc-950/60 p-4">
        {state.status === "loading" && (
          <p className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            불러오는 중입니다...
          </p>
        )}
        {(state.status === "error" || state.status === "unavailable") && (
          <p className="flex items-center gap-2 text-sm text-zinc-500">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
            {state.message}
          </p>
        )}
        {state.status === "ready" && (
          <img src={state.url} alt={attachment?.name ?? ""} className="max-h-[55vh] max-w-full rounded object-contain" />
        )}
      </div>
    </div>
  );
}
