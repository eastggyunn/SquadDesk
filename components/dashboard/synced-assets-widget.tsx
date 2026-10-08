"use client";

import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Download, Eye, History, Pencil, Plus, RefreshCw, Trash2, UploadCloud, X } from "lucide-react";
import {
  useSyncedAssetsStore,
  type SyncedAsset,
  type SyncedAssetCategory,
} from "@/lib/store/synced-assets-store";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { AttachmentIcon, inferAttachmentKind, isImageAttachment } from "@/components/kanban/attachment-icon";
import { downloadMockAttachment } from "@/lib/mock-download";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useActiveProject } from "@/lib/supabase/use-active-project";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { useSupabaseSyncedAssets } from "@/lib/supabase/hooks/use-supabase-synced-assets";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { createAttachmentPreviewUrl, downloadAttachment } from "@/lib/supabase/repositories/attachments";
import type { AssetSyncHistoryEntry } from "@/lib/supabase/repositories/synced-assets";
import { DeleteConfirmModal } from "@/components/kanban/delete-confirm-modal";
import { ErrorAlert } from "@/components/ui/error-alert";
import { AttachmentPreviewModal } from "@/components/ui/attachment-preview-modal";
import { AssetVersionHistoryModal } from "./asset-version-history-modal";
import { AssetVersionCompareModal } from "./asset-version-compare-modal";
import { primaryButtonSm } from "@/components/ui/button-styles";
import { SPRING } from "@/lib/motion";

const DASHBOARD_UPLOAD_SOURCE = "대시보드에서 직접 업로드";
/** 대시보드에서 기본으로 보여줄 카테고리 수 — 하단 위젯이라 화면을 많이 차지하지 않게 최신 항목만 먼저 보여준다. */
const VISIBLE_CATEGORY_LIMIT = 4;

export function SyncedAssetsWidget() {
  const supabaseMode = isSupabaseConfigured();
  const currentUser = useCurrentUser();
  const { activeProject } = useActiveProject();
  const activeProjectId = supabaseMode ? (activeProject?.id ?? null) : null;

  // 두 데이터 소스 모두 항상 호출한다(Hooks 규칙) — 실제로 화면에 쓰이는 쪽만 아래에서 고른다.
  const mockCategories = useSyncedAssetsStore((state) => state.categories);
  const mockAssets = useSyncedAssetsStore((state) => state.assets);
  const mockAddCategory = useSyncedAssetsStore((state) => state.addCategory);
  const mockRemoveCategory = useSyncedAssetsStore((state) => state.removeCategory);
  const mockSyncAsset = useSyncedAssetsStore((state) => state.syncAsset);
  const mockRenameAsset = useSyncedAssetsStore((state) => state.renameAsset);

  const supabaseAssets = useSupabaseSyncedAssets(activeProjectId, currentUser.id);

  const categories = supabaseMode ? supabaseAssets.categories : mockCategories;
  const assets = supabaseMode ? supabaseAssets.assets : mockAssets;

  const [isAdding, setIsAdding] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [uploadingCategoryId, setUploadingCategoryId] = useState<string | null>(null);
  const [pendingDeleteCategoryId, setPendingDeleteCategoryId] = useState<string | null>(null);
  const [showAllCategories, setShowAllCategories] = useState(false);

  const isAddingCategory = supabaseMode && supabaseAssets.isAddingCategory;

  function handleCreateCategory() {
    if (isAddingCategory) return; // 저장 중 재실행 방지 — 실제 중복 방지는 훅의 in-flight guard가 보장한다
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;

    if (supabaseMode) supabaseAssets.addCategory(trimmed);
    else mockAddCategory(trimmed);
    setNewCategoryName("");
    setIsAdding(false);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      handleCreateCategory();
    }
  }

  function handleUpload(categoryId: string, file: File) {
    if (supabaseMode) {
      setUploadingCategoryId(categoryId);
      supabaseAssets
        .uploadAsset(categoryId, file, DASHBOARD_UPLOAD_SOURCE)
        .finally(() => setUploadingCategoryId(null));
      return;
    }
    mockSyncAsset(
      categoryId,
      { id: crypto.randomUUID(), name: file.name, kind: inferAttachmentKind(file.name) },
      DASHBOARD_UPLOAD_SOURCE
    );
  }

  function handleRename(categoryId: string, name: string) {
    if (supabaseMode) supabaseAssets.renameAsset(categoryId, name);
    else mockRenameAsset(categoryId, name);
  }

  function confirmRemoveCategory() {
    if (!pendingDeleteCategoryId) return;
    if (supabaseMode) supabaseAssets.removeCategory(pendingDeleteCategoryId);
    else mockRemoveCategory(pendingDeleteCategoryId);
    setPendingDeleteCategoryId(null);
  }

  const pendingDeleteCategory = categories.find((category) => category.id === pendingDeleteCategoryId);

  // 최근에 갱신된 카테고리부터 보여준다 — 아직 아무것도 동기화되지 않은 카테고리는 뒤로 밀린다.
  const sortedCategories = [...categories].sort((a, b) => {
    const aUpdatedAt = assets[a.id]?.updatedAt ?? "";
    const bUpdatedAt = assets[b.id]?.updatedAt ?? "";
    return bUpdatedAt.localeCompare(aUpdatedAt);
  });
  const hasHiddenCategories = sortedCategories.length > VISIBLE_CATEGORY_LIMIT;
  const visibleCategories = showAllCategories ? sortedCategories : sortedCategories.slice(0, VISIBLE_CATEGORY_LIMIT);

  return (
    <HydrationGate>
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-zinc-200">최신 통합 에셋</h2>
        </div>
        <div className="flex items-center gap-3">
          {hasHiddenCategories && (
            <button
              type="button"
              onClick={() => setShowAllCategories((prev) => !prev)}
              className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
            >
              {showAllCategories ? "간략히 보기" : `전체 보기 (${categories.length})`}
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsAdding((prev) => !prev)}
            className="flex items-center gap-1 text-xs font-medium text-cyan-400 transition-colors hover:text-cyan-300"
          >
            <Plus className="h-3.5 w-3.5" />
            카테고리 추가
          </button>
        </div>
      </div>

      {supabaseMode && supabaseAssets.error && (
        <div className="mt-3">
          <ErrorAlert message={supabaseAssets.error} />
        </div>
      )}

      <AnimatePresence initial={false}>
        {isAdding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING.collapse}
            className="overflow-hidden"
          >
            <div className="mt-3 flex items-center gap-2">
              <input
                autoFocus
                value={newCategoryName}
                disabled={isAddingCategory}
                onChange={(event) => setNewCategoryName(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="예: 사운드 파일, 기획 문서"
                className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 transition-opacity duration-150 focus:border-cyan-500 focus:outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={handleCreateCategory}
                disabled={isAddingCategory}
                className={`shrink-0 ${primaryButtonSm}`}
              >
                {isAddingCategory ? "저장 중..." : "추가"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {supabaseMode && supabaseAssets.isLoading ? (
        <p className="mt-4 py-6 text-center text-xs text-zinc-600">불러오는 중입니다...</p>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <AnimatePresence initial={false}>
            {visibleCategories.map((category) => (
              <SyncedAssetCard
                key={category.id}
                category={category}
                asset={assets[category.id]}
                isSupabaseMode={supabaseMode}
                isUploading={supabaseMode && uploadingCategoryId === category.id}
                onUpload={handleUpload}
                onRename={handleRename}
                onRemoveCategory={() => setPendingDeleteCategoryId(category.id)}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>

    <DeleteConfirmModal
      open={pendingDeleteCategoryId !== null}
      description={
        pendingDeleteCategory ? `"${pendingDeleteCategory.label}" 카테고리를 삭제하시겠습니까?` : undefined
      }
      helperText={
        supabaseMode
          ? "이 카테고리에 직접 업로드한 파일은 함께 삭제되고, 작업·버그·채팅에서 동기화된 원본 첨부는 그대로 남습니다."
          : undefined
      }
      onCancel={() => setPendingDeleteCategoryId(null)}
      onConfirm={confirmRemoveCategory}
    />
    </HydrationGate>
  );
}

interface SyncedAssetCardProps {
  category: SyncedAssetCategory;
  asset: SyncedAsset | undefined;
  isSupabaseMode: boolean;
  isUploading: boolean;
  onUpload: (categoryId: string, file: File) => void;
  onRename: (categoryId: string, name: string) => void;
  onRemoveCategory: () => void;
}

function SyncedAssetCard({
  category,
  asset,
  isSupabaseMode,
  isUploading,
  onUpload,
  onRename,
  onRemoveCategory,
}: SyncedAssetCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isPreviewingCurrent, setIsPreviewingCurrent] = useState(false);
  /** 이 카드가 지금 무엇을 열고 있는지 — 버전 이력과 비교는 동시에 열리지 않는다(비교는 이력에서 골라 들어간다). */
  const [dialog, setDialog] = useState<
    { type: "none" } | { type: "history" } | { type: "compare"; entries: [AssetSyncHistoryEntry, AssetSyncHistoryEntry] }
  >({ type: "none" });

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onUpload(category.id, file);
  }

  function handleDrop(event: DragEvent<HTMLLIElement>) {
    event.preventDefault();
    setIsDragOver(false);
    if (isUploading) return;
    const file = event.dataTransfer.files?.[0];
    if (file) onUpload(category.id, file);
  }

  function startRename() {
    if (!asset) return;
    setRenameValue(asset.attachment.name);
    setIsRenaming(true);
  }

  function commitRename() {
    const trimmed = renameValue.trim();
    if (trimmed) onRename(category.id, trimmed);
    setIsRenaming(false);
  }

  function handleRenameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitRename();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setIsRenaming(false);
    }
  }

  async function handleDownload() {
    if (!asset) return;
    if (isSupabaseMode && asset.attachment.storagePath) {
      setDownloadError(null);
      try {
        await downloadAttachment(getBrowserSupabaseClient(), {
          storagePath: asset.attachment.storagePath,
          name: asset.attachment.name,
        });
      } catch (err) {
        setDownloadError(err instanceof Error ? err.message : "다운로드에 실패했습니다.");
      }
      return;
    }
    downloadMockAttachment(asset.attachment.name);
  }

  const canDownload = !isSupabaseMode || Boolean(asset?.attachment.storagePath);

  return (
    <>
    <motion.li
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={SPRING.collapse}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={`relative flex items-center justify-between gap-3 rounded-lg border p-3 pr-9 transition-colors ${
        isDragOver ? "border-cyan-500/60 bg-cyan-500/5" : "border-transparent bg-zinc-950/50"
      }`}
    >
      <input ref={fileInputRef} type="file" onChange={handleFileInputChange} className="hidden" />

      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-zinc-500">{category.label}</p>
        <AnimatePresence initial={false}>
          {isUploading ? (
            <motion.p
              key="uploading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-1 flex items-center gap-1.5 text-sm text-zinc-500"
            >
              <UploadCloud className="h-3.5 w-3.5 shrink-0 animate-pulse" />
              업로드 중...
            </motion.p>
          ) : asset ? (
            <motion.div
              key="filled"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={SPRING.collapse}
            >
              {isRenaming ? (
                <div className="mt-1 flex items-center gap-1">
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onKeyDown={handleRenameKeyDown}
                    onBlur={commitRename}
                    className="min-w-0 flex-1 rounded border border-cyan-600 bg-zinc-950 px-1.5 py-0.5 text-sm text-zinc-100 focus:outline-none"
                  />
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={commitRename}
                    title="이름 저장"
                    className="shrink-0 rounded p-1 text-zinc-500 transition-transform duration-150 hover:text-cyan-400 active:scale-90"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setIsRenaming(false)}
                    title="취소"
                    className="shrink-0 rounded p-1 text-zinc-500 transition-transform duration-150 hover:text-red-400 active:scale-90"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="mt-1 flex items-center gap-1.5">
                  <AttachmentIcon kind={asset.attachment.kind} className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                  {asset.attachment.url ? (
                    <a
                      href={asset.attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-sm text-zinc-100 underline-offset-2 hover:text-cyan-400 hover:underline"
                    >
                      {asset.attachment.name}
                    </a>
                  ) : (
                    <span className="truncate text-sm text-zinc-100">{asset.attachment.name}</span>
                  )}
                  <button
                    type="button"
                    onClick={startRename}
                    title="이름 수정"
                    className="shrink-0 rounded p-0.5 text-zinc-600 transition-transform duration-150 hover:text-cyan-400 active:scale-90"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
              )}
              <p className="mt-0.5 truncate text-[11px] text-zinc-600">
                {asset.sourceLabel} · {asset.updatedAt}
              </p>
              {downloadError && <p className="mt-0.5 text-[11px] text-red-400">{downloadError}</p>}
            </motion.div>
          ) : (
            <motion.button
              key="empty"
              type="button"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={SPRING.collapse}
              onClick={() => fileInputRef.current?.click()}
              className="mt-1 flex items-center gap-1.5 text-sm text-zinc-600 transition-transform duration-150 hover:text-cyan-400 active:scale-[0.98]"
            >
              <UploadCloud className="h-3.5 w-3.5 shrink-0" />
              클릭하거나 드래그해서 업로드
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {asset && !isRenaming && !isUploading && (
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="파일 교체 업로드"
            className="rounded-md p-1.5 text-zinc-500 transition-transform duration-150 hover:bg-zinc-800 hover:text-cyan-400 active:scale-90"
          >
            <UploadCloud className="h-4 w-4" />
          </button>
          {isSupabaseMode && asset && isImageAttachment(asset.attachment) && asset.attachment.storagePath && (
            <button
              type="button"
              onClick={() => setIsPreviewingCurrent(true)}
              title="미리보기"
              className="rounded-md p-1.5 text-zinc-500 transition-transform duration-150 hover:bg-zinc-800 hover:text-cyan-400 active:scale-90"
            >
              <Eye className="h-4 w-4" />
            </button>
          )}
          {canDownload && (
            <button
              type="button"
              onClick={handleDownload}
              title="다운로드"
              className="rounded-md p-1.5 text-zinc-500 transition-transform duration-150 hover:bg-zinc-800 hover:text-cyan-400 active:scale-90"
            >
              <Download className="h-4 w-4" />
            </button>
          )}
          {isSupabaseMode && asset && (
            <button
              type="button"
              onClick={() => setDialog({ type: "history" })}
              title="버전 이력"
              className="rounded-md p-1.5 text-zinc-500 transition-transform duration-150 hover:bg-zinc-800 hover:text-cyan-400 active:scale-90"
            >
              <History className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onRemoveCategory}
        title="카테고리 삭제"
        className="absolute right-2 top-2 rounded p-1 text-zinc-600 transition-transform duration-150 hover:text-red-400 active:scale-90"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </motion.li>

    {isSupabaseMode && asset && (
      <AttachmentPreviewModal
        open={isPreviewingCurrent}
        fileName={asset.attachment.name}
        resolveUrl={
          asset.attachment.storagePath
            ? async () => createAttachmentPreviewUrl(getBrowserSupabaseClient(), asset.attachment.storagePath!)
            : null
        }
        onClose={() => setIsPreviewingCurrent(false)}
      />
    )}

    {isSupabaseMode && (
      <>
        <AssetVersionHistoryModal
          open={dialog.type === "history"}
          categoryId={category.id}
          categoryLabel={category.label}
          onClose={() => setDialog({ type: "none" })}
          onCompare={(entries) => setDialog({ type: "compare", entries })}
        />
        <AssetVersionCompareModal
          open={dialog.type === "compare"}
          entries={dialog.type === "compare" ? dialog.entries : null}
          onBack={() => setDialog({ type: "history" })}
          onClose={() => setDialog({ type: "none" })}
        />
      </>
    )}
    </>
  );
}
