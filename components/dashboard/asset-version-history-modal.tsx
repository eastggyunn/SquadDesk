"use client";

import { useEffect, useState } from "react";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, Columns2, Download, Eye, History, Loader2, X } from "lucide-react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { createAttachmentPreviewUrl, downloadAttachment } from "@/lib/supabase/repositories/attachments";
import type { AssetSyncHistoryEntry } from "@/lib/supabase/repositories/synced-assets";
import { useAssetVersionHistory } from "@/lib/supabase/hooks/use-asset-version-history";
import { AttachmentIcon, isImageAttachment } from "@/components/kanban/attachment-icon";
import { AttachmentPreviewModal } from "@/components/ui/attachment-preview-modal";
import { ErrorAlert } from "@/components/ui/error-alert";
import { ModalPortal } from "@/components/ui/modal-portal";
import { formatRelativeTime } from "@/lib/format";
import { primaryButtonSm } from "@/components/ui/button-styles";
import { FADE, SPRING } from "@/lib/motion";
import { useOverlayDepth } from "@/lib/store/overlay-store";

interface AssetVersionHistoryModalProps {
  open: boolean;
  categoryId: string;
  categoryLabel: string;
  onClose: () => void;
  onCompare: (entries: [AssetSyncHistoryEntry, AssetSyncHistoryEntry]) => void;
}

/** 이력 항목이 비교(이미지 두 장 나란히 보기) 대상으로 선택될 수 있는지. */
function isComparable(entry: AssetSyncHistoryEntry): boolean {
  return entry.attachment !== null && isImageAttachment(entry.attachment) && Boolean(entry.attachment.storagePath);
}

/**
 * 카테고리 하나의 전체 동기화 이력. "버전 이력" 버튼을 눌렀을 때만 열리고,
 * 열릴 때 한 번만 조회한다(대시보드 진입 시 자동 조회 없음). 최신 버전(맨 위,
 * 목록 자체가 최신순)과 과거 버전을 "최신" 배지로 구분한다.
 */
export function AssetVersionHistoryModal({
  open,
  categoryId,
  categoryLabel,
  onClose,
  onCompare,
}: AssetVersionHistoryModalProps) {
  useOverlayDepth(open);
  return (
    <ModalPortal>
      <AnimatePresence>
        {open && (
          <AssetVersionHistoryModalContent
            categoryId={categoryId}
            categoryLabel={categoryLabel}
            onClose={onClose}
            onCompare={onCompare}
          />
        )}
      </AnimatePresence>
    </ModalPortal>
  );
}

function AssetVersionHistoryModalContent({
  categoryId,
  categoryLabel,
  onClose,
  onCompare,
}: Omit<AssetVersionHistoryModalProps, "open">) {
  const shouldReduceMotion = useReducedMotion();
  const { entries, isLoading, error, load } = useAssetVersionHistory(categoryId);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewingEntry, setPreviewingEntry] = useState<AssetSyncHistoryEntry | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 이 모달은 열릴 때 새로 마운트되므로 최초 1회만 조회한다.
  }, []);

  useEscapeKey(onClose);

  function toggleSelected(entryId: string) {
    setSelectedIds((prev) => {
      if (prev.includes(entryId)) return prev.filter((id) => id !== entryId);
      if (prev.length >= 2) return prev; // 두 개까지만 — 셋째는 무시한다(다른 걸 먼저 해제해야 한다).
      return [...prev, entryId];
    });
  }

  async function handleDownload(entry: AssetSyncHistoryEntry) {
    if (!entry.attachment?.storagePath) return;
    setDownloadError(null);
    try {
      await downloadAttachment(getBrowserSupabaseClient(), {
        storagePath: entry.attachment.storagePath,
        name: entry.attachment.name,
      });
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "다운로드에 실패했습니다.");
    }
  }

  function handleStartCompare() {
    const [firstId, secondId] = selectedIds;
    const first = entries.find((entry) => entry.id === firstId);
    const second = entries.find((entry) => entry.id === secondId);
    if (first && second) onCompare([first, second]);
  }

  return (
    <>
      <motion.div
        key="asset-history-backdrop"
        className="fixed inset-0 z-[70] bg-black/70"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={FADE}
        onClick={onClose}
      />

      <motion.div
        key="asset-history-panel"
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
          aria-labelledby="asset-history-title"
          onClick={(event) => event.stopPropagation()}
          className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <History className="h-4 w-4 shrink-0 text-cyan-400" />
              <h2 id="asset-history-title" className="min-w-0 truncate text-sm font-semibold text-zinc-100">
                버전 이력 — {categoryLabel}
              </h2>
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

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {error ? (
              <ErrorAlert message={error} />
            ) : isLoading ? (
              <p className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                불러오는 중입니다...
              </p>
            ) : entries.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-600">동기화 이력이 없습니다.</p>
            ) : (
              <>
                {downloadError && (
                  <div className="mb-2">
                    <ErrorAlert message={downloadError} />
                  </div>
                )}
                <ul className="space-y-2">
                  {entries.map((entry, index) => (
                    <li
                      key={entry.id}
                      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 ${
                        selectedIds.includes(entry.id)
                          ? "border-cyan-500/60 bg-cyan-500/5"
                          : "border-zinc-800 bg-zinc-950/50"
                      }`}
                    >
                      {isComparable(entry) && (
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(entry.id)}
                          onChange={() => toggleSelected(entry.id)}
                          disabled={!selectedIds.includes(entry.id) && selectedIds.length >= 2}
                          title="비교할 버전으로 선택"
                          className="h-4 w-4 shrink-0 accent-cyan-500"
                        />
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {entry.attachment ? (
                            <AttachmentIcon kind={entry.attachment.kind} className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                          ) : (
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                          )}
                          <span className="truncate text-sm text-zinc-100">
                            {entry.attachment?.name ?? "파일을 찾을 수 없음"}
                          </span>
                          {index === 0 && (
                            <span className="shrink-0 rounded-full bg-cyan-500/15 px-1.5 py-0.5 text-[11px] font-medium text-cyan-400">
                              최신
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-zinc-600">
                          {entry.sourceLabel} · {formatRelativeTime(entry.createdAt)}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-0.5">
                        {isComparable(entry) && (
                          <button
                            type="button"
                            onClick={() => setPreviewingEntry(entry)}
                            title="미리보기"
                            className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-cyan-400"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                        {entry.attachment?.storagePath && (
                          <button
                            type="button"
                            onClick={() => handleDownload(entry)}
                            title="다운로드"
                            className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-cyan-400"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-zinc-800 px-4 py-3">
            <p className="text-xs text-zinc-600">
              {selectedIds.length === 2 ? "두 버전을 선택했습니다." : "이미지 버전 2개를 선택하면 비교할 수 있습니다."}
            </p>
            <button
              type="button"
              onClick={handleStartCompare}
              disabled={selectedIds.length !== 2}
              className={`shrink-0 ${primaryButtonSm}`}
            >
              <Columns2 className="h-3.5 w-3.5" />
              선택한 버전 비교
            </button>
          </div>
        </div>
      </motion.div>

      <AttachmentPreviewModal
        open={previewingEntry !== null}
        fileName={previewingEntry?.attachment?.name ?? ""}
        resolveUrl={
          previewingEntry?.attachment?.storagePath
            ? async () => createAttachmentPreviewUrl(getBrowserSupabaseClient(), previewingEntry.attachment!.storagePath!)
            : null
        }
        onClose={() => setPreviewingEntry(null)}
      />
    </>
  );
}
