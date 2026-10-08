"use client";

import { useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { Download, ExternalLink, Eye, UploadCloud, X } from "lucide-react";
import type { Attachment } from "@/lib/types";
import { downloadMockAttachment } from "@/lib/mock-download";
import { AttachmentIcon, inferAttachmentKind, isImageAttachment } from "./attachment-icon";
import { AttachmentPreviewModal } from "@/components/ui/attachment-preview-modal";

interface AttachmentPickerProps {
  attachments: Attachment[];
  onChange: (next: Attachment[]) => void;
  dropzoneLabel?: string;
  dropzoneHint?: string;
  linkPlaceholder?: string;
  itemClassName?: (attachment: Attachment) => string;
  renderItemBadge?: (attachment: Attachment) => ReactNode;
  renderItemExtra?: (attachment: Attachment) => ReactNode;
  /** 파일 입력/드롭으로 새 파일이 추가될 때마다(onChange와 별도로) 원본 File과 함께 알려준다. 실 업로드가 필요한 호출부(Supabase 모드)만 사용한다. */
  onFilesAdded?: (items: { attachment: Attachment; file: File }[]) => void;
  /** 주어지면(Supabase 모드) 다운로드 버튼이 downloadMockAttachment 대신 이 콜백을 사용하고, 실 파일(storagePath 있음)에만 표시된다. 없으면(데모 모드) 항상 표시하고 목업 다운로드를 쓴다. */
  onDownload?: (attachment: Attachment) => void;
  /**
   * 주어지면(Supabase 모드) 이미지 첨부(kind==="image" 또는 이미지 확장자)에
   * 미리보기 버튼이 붙는다. 없으면(로컬 데모 모드) 실제 파일이 없는 목업 첨부를
   * 억지로 미리보기하지 않도록 버튼 자체를 보여주지 않는다 — 기존 다운로드
   * 동작만 유지된다.
   */
  onResolvePreviewUrl?: (attachment: Attachment) => Promise<string>;
  /** true면 드롭존/링크추가/삭제를 비활성화한다(업로드 중이거나 대상이 없을 때). */
  disabled?: boolean;
}

/**
 * Shared dropzone + link-add + list UI for attaching files to a task, bug, or
 * chat message. Item rendering can be extended per-caller via renderItemBadge
 * (inline badge next to the filename) and renderItemExtra (content below the
 * row, e.g. task-form's dashboard-sync toggle) without this component needing
 * to know about those feature-specific concerns.
 */
export function AttachmentPicker({
  attachments,
  onChange,
  dropzoneLabel = "파일을 드래그하거나 클릭해서 첨부",
  dropzoneHint = "이미지, .xlsx, .zip/.apk, .spine 등",
  linkPlaceholder = "외부 링크 붙여넣기",
  itemClassName,
  renderItemBadge,
  renderItemExtra,
  onFilesAdded,
  onDownload,
  onResolvePreviewUrl,
  disabled = false,
}: AttachmentPickerProps) {
  const [linkInput, setLinkInput] = useState("");
  const [previewingAttachment, setPreviewingAttachment] = useState<Attachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || disabled) return;

    const files = Array.from(fileList);
    const newAttachments: Attachment[] = files.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      kind: inferAttachmentKind(file.name),
    }));

    onChange([...attachments, ...newAttachments]);
    onFilesAdded?.(newAttachments.map((attachment, index) => ({ attachment, file: files[index] })));
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    addFiles(event.target.files);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    addFiles(event.dataTransfer.files);
  }

  function handleAddLink() {
    if (disabled) return;
    const trimmed = linkInput.trim();
    if (!trimmed) return;

    onChange([
      ...attachments,
      {
        id: crypto.randomUUID(),
        name: trimmed,
        kind: trimmed.includes("figma.com") ? "figma" : "link",
        url: trimmed,
      },
    ]);
    setLinkInput("");
  }

  function removeAttachment(id: string) {
    if (disabled) return;
    onChange(attachments.filter((attachment) => attachment.id !== id));
  }

  function handleDownloadClick(attachment: Attachment) {
    if (onDownload) onDownload(attachment);
    else downloadMockAttachment(attachment.name);
  }

  function handlePreviewClick(attachment: Attachment) {
    setPreviewingAttachment(attachment);
  }

  return (
    <div>
      <div
        onClick={() => !disabled && fileInputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        aria-disabled={disabled}
        className={`flex flex-col items-center gap-1.5 rounded-lg border-2 border-dashed border-zinc-700 bg-zinc-950/50 px-4 py-6 text-center transition-colors ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-cyan-500/50 hover:bg-zinc-900"
        }`}
      >
        <UploadCloud className="h-6 w-6 text-zinc-500" />
        <p className="text-sm text-zinc-400">{dropzoneLabel}</p>
        <p className="text-xs text-zinc-600">{dropzoneHint}</p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        disabled={disabled}
        onChange={handleFileInputChange}
        className="hidden"
      />

      <div className="mt-2 flex gap-2">
        <input
          value={linkInput}
          disabled={disabled}
          onChange={(event) => setLinkInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleAddLink();
            }
          }}
          placeholder={linkPlaceholder}
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleAddLink}
          disabled={disabled}
          className="rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
        >
          추가
        </button>
      </div>

      {attachments.length > 0 && (
        <ul className="mt-3 space-y-2">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className={`rounded-lg border px-3 py-2.5 transition-colors ${
                itemClassName?.(attachment) ?? "border-zinc-800 bg-zinc-950/50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <AttachmentIcon kind={attachment.kind} className="h-4 w-4 shrink-0 text-cyan-400" />
                  <span className="truncate text-sm text-zinc-200">{attachment.name}</span>
                  {renderItemBadge?.(attachment)}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {attachment.url && (
                    <a
                      href={attachment.url.startsWith("http") ? attachment.url : `https://${attachment.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="외부 링크/시안 바로가기"
                      className="rounded p-1 text-zinc-500 transition-colors hover:text-cyan-400"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  {onResolvePreviewUrl && isImageAttachment(attachment) && (
                    <button
                      type="button"
                      onClick={() => handlePreviewClick(attachment)}
                      title="미리보기"
                      className="rounded p-1 text-zinc-500 transition-colors hover:text-cyan-400"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  )}
                  {(!onDownload || attachment.storagePath) && (
                    <button
                      type="button"
                      onClick={() => handleDownloadClick(attachment)}
                      title="다운로드"
                      className="rounded p-1 text-zinc-500 transition-colors hover:text-cyan-400"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachment.id)}
                    disabled={disabled}
                    title="첨부 취소"
                    className="rounded p-1 text-zinc-500 transition-colors hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {renderItemExtra?.(attachment)}
            </li>
          ))}
        </ul>
      )}

      {onResolvePreviewUrl && (
        <AttachmentPreviewModal
          open={previewingAttachment !== null}
          fileName={previewingAttachment?.name ?? ""}
          resolveUrl={previewingAttachment ? () => onResolvePreviewUrl(previewingAttachment) : null}
          onClose={() => setPreviewingAttachment(null)}
        />
      )}
    </div>
  );
}
