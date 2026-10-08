"use client";

import { useState, type FormEvent } from "react";
import { Trash2, X } from "lucide-react";
import type { Attachment, Bug, BugSeverity, BugStatus } from "@/lib/types";
import { AttachmentPicker } from "@/components/kanban/attachment-picker";
import { useAttachmentUploadState } from "@/lib/hooks/use-attachment-upload-state";
import { primaryButton, secondaryButton } from "@/components/ui/button-styles";
import { Select } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";

export interface BugFormValues {
  title: string;
  severity: BugSeverity;
  location: string;
  status: BugStatus;
  reproductionSteps: string;
  consoleLog: string;
  attachments: Attachment[];
  /** 아직 Storage에 올라가지 않은 로컬 파일(attachment id -> File). Supabase 모드에서만 채워진다. */
  pendingFiles: Map<string, File>;
  /** 연결할 작업 id. taskOptions 모드(Supabase)에서만 폼에 노출된다. */
  taskId?: string;
}

export interface TaskOption {
  id: string;
  title: string;
}

const SEVERITIES: BugSeverity[] = ["Blocker", "High", "Medium", "Low"];
const STATUSES: BugStatus[] = ["Open", "In Progress", "Resolved", "Closed"];

const FIELD_CLASSNAME =
  "mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500 focus:outline-none";

const LOCATION_SUGGESTIONS = ["로비", "인게임 맵", "인벤토리", "상점", "결과 화면", "설정 메뉴"];

export interface BugFormProps {
  mode: "create" | "edit";
  bug?: Bug;
  /** 주어지면(Supabase 모드) "연결 작업" select를 보여준다. */
  taskOptions?: TaskOption[];
  /** Supabase 모드의 활성 프로젝트 id. taskOptions가 주어졌는데 이 값이 없으면 첨부 업로드를 막고 안내한다. */
  projectId?: string | null;
  onClose: () => void;
  onSubmit: (values: BugFormValues) => void | Promise<void>;
  onRequestDelete?: () => void;
}

export function BugForm({ mode, bug, taskOptions, projectId, onClose, onSubmit, onRequestDelete }: BugFormProps) {
  const [severity, setSeverity] = useState<BugSeverity>(bug?.severity ?? "Medium");
  const [status, setStatus] = useState<BugStatus>(bug?.status ?? "Open");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isSupabaseMode = Boolean(taskOptions);
  const {
    attachments,
    setAttachments,
    pendingFiles,
    uploadError,
    handleFilesAdded,
    isPending,
    handleDownload,
    resolvePreviewUrl,
  } = useAttachmentUploadState(bug?.attachments ?? []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await onSubmit({
        title: String(formData.get("title") ?? ""),
        severity,
        location: String(formData.get("location") ?? ""),
        status,
        reproductionSteps: String(formData.get("reproductionSteps") ?? ""),
        consoleLog: String(formData.get("consoleLog") ?? ""),
        attachments,
        pendingFiles,
        taskId: taskOptions ? String(formData.get("taskId") ?? "") || undefined : undefined,
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "저장하지 못했습니다. 다시 시도해주세요.");
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-50">
          {mode === "create" ? "새 버그 리포트 작성" : "버그 리포트 수정"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="rounded-md p-1.5 text-zinc-500 transition-transform duration-150 hover:bg-zinc-800 hover:text-zinc-200 active:scale-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        <div>
          <label htmlFor="title" className="text-sm font-medium text-zinc-400">
            버그 제목
          </label>
          <input
            id="title"
            name="title"
            required
            defaultValue={bug?.title}
            placeholder="예: 사망 시 루팅한 아이템이 증발하지 않는 버그"
            className={FIELD_CLASSNAME}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="severity" className="text-sm font-medium text-zinc-400">
              치명도
            </label>
            <Select
              id="severity"
              value={severity}
              onChange={(next) => setSeverity(next as BugSeverity)}
              options={SEVERITIES.map((level) => ({ value: level, label: level }))}
              className={FIELD_CLASSNAME}
            />
          </div>

          <div>
            <label htmlFor="status" className="text-sm font-medium text-zinc-400">
              상태
            </label>
            <Select
              id="status"
              value={status}
              onChange={(next) => setStatus(next as BugStatus)}
              options={STATUSES.map((option) => ({ value: option, label: option }))}
              className={FIELD_CLASSNAME}
            />
          </div>
        </div>

        <div>
          <label htmlFor="location" className="text-sm font-medium text-zinc-400">
            발생 위치
          </label>
          <Combobox
            id="location"
            name="location"
            required
            defaultValue={bug?.location}
            placeholder="예: 로비, 인게임 맵, 인벤토리"
            suggestions={LOCATION_SUGGESTIONS}
            className={FIELD_CLASSNAME}
          />
        </div>

        {taskOptions && (
          <div>
            <label htmlFor="taskId" className="text-sm font-medium text-zinc-400">
              연결 작업 <span className="text-zinc-600">(선택)</span>
            </label>
            <Select
              id="taskId"
              name="taskId"
              defaultValue={bug?.taskId ?? ""}
              options={[
                { value: "", label: "연결 안 함" },
                ...taskOptions.map((task) => ({ value: task.id, label: task.title })),
              ]}
              className={FIELD_CLASSNAME}
            />
          </div>
        )}

        <div>
          <label htmlFor="reproductionSteps" className="text-sm font-medium text-zinc-400">
            재현 단계 (Steps to Reproduce)
          </label>
          <textarea
            id="reproductionSteps"
            name="reproductionSteps"
            required
            rows={5}
            defaultValue={bug?.reproductionSteps}
            placeholder={"1. \n2. \n3. "}
            className={`${FIELD_CLASSNAME} resize-none`}
          />
        </div>

        <div>
          <label htmlFor="consoleLog" className="text-sm font-medium text-zinc-400">
            Unity 에디터 콘솔 로그
          </label>
          <textarea
            id="consoleLog"
            name="consoleLog"
            rows={5}
            defaultValue={bug?.consoleLog}
            placeholder="NullReferenceException: ..."
            className="mt-1.5 w-full resize-none rounded-lg border border-zinc-700 bg-black/40 px-4 py-3 font-mono text-xs text-emerald-400/90 placeholder:text-zinc-700 focus:border-cyan-500 focus:outline-none"
          />
        </div>

        <div>
          <span className="text-sm font-medium text-zinc-400">스크린샷 / 첨부파일</span>
          <div className="mt-1.5">
            {isSupabaseMode && !projectId ? (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-400">
                활성 프로젝트가 없어 첨부파일을 업로드할 수 없습니다.
              </p>
            ) : (
              <AttachmentPicker
                attachments={attachments}
                onChange={setAttachments}
                dropzoneLabel="스크린샷을 드래그하거나 클릭해서 첨부"
                dropzoneHint="이미지, 로그 파일 등"
                disabled={isSubmitting}
                onFilesAdded={isSupabaseMode ? handleFilesAdded : undefined}
                onDownload={isSupabaseMode ? handleDownload : undefined}
                onResolvePreviewUrl={isSupabaseMode ? resolvePreviewUrl : undefined}
                renderItemBadge={(attachment) =>
                  isSupabaseMode && isPending(attachment.id) ? (
                    <span className="shrink-0 rounded-full bg-zinc-700/60 px-2 py-0.5 text-[11px] font-medium text-zinc-300">
                      {isSubmitting ? "업로드 중..." : "업로드 대기"}
                    </span>
                  ) : null
                }
              />
            )}
            {uploadError && <p className="mt-2 text-sm text-red-400">{uploadError}</p>}
          </div>
        </div>

        {submitError && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
            {submitError}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          {mode === "edit" && onRequestDelete ? (
            <button
              type="button"
              onClick={onRequestDelete}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/40 px-3.5 py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              삭제
            </button>
          ) : (
            <span />
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className={secondaryButton}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={primaryButton}
            >
              {isSubmitting ? "저장 중..." : submitError ? "다시 시도" : mode === "create" ? "버그 등록" : "저장"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
