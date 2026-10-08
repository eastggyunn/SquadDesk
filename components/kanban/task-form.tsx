"use client";

import { useMemo, useState, type FormEvent } from "react";
import { RefreshCw, Trash2, X } from "lucide-react";
import type { Attachment, Task, TaskPriority } from "@/lib/types";
import { DatePicker } from "./date-picker";
import { AttachmentPicker } from "./attachment-picker";
import { AttachmentSyncToggle, type PendingSync } from "./attachment-sync-toggle";
import { findSyncedCategory, useSyncedAssetsStore, type SyncedAssetCategory } from "@/lib/store/synced-assets-store";
import { useWorkDomainsStore, type WorkDomain } from "@/lib/store/work-domains-store";
import type { ProjectMemberOption } from "@/lib/supabase/repositories/project-members";
import { useAttachmentUploadState } from "@/lib/hooks/use-attachment-upload-state";
import { useSupabaseSyncedAssets } from "@/lib/supabase/hooks/use-supabase-synced-assets";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { syncExistingAttachment } from "@/lib/supabase/repositories/synced-assets";
import { primaryButton, secondaryButton } from "@/components/ui/button-styles";
import { useSprints } from "@/lib/hooks/use-sprints";
import { formatSprintRange } from "@/lib/sprint-utils";
import { Select } from "@/components/ui/select";

export interface TaskFormValues {
  title: string;
  assigneeName: string;
  assigneeRole: string;
  /** 활성 프로젝트 멤버 중에서 고른 담당자 id. projectMembers 모드(Supabase)에서만 채워진다. */
  assigneeId?: string;
  startDate: string;
  dueDate: string;
  priority: TaskPriority;
  attachments: Attachment[];
  /** 아직 Storage에 올라가지 않은 로컬 파일(attachment id -> File). Supabase 모드에서만 채워진다. */
  pendingFiles: Map<string, File>;
  domainId?: string;
  /** 비어 있으면 백로그. */
  sprintId?: string;
}

const PRIORITIES: TaskPriority[] = ["High", "Medium", "Low"];

const PRIORITY_SELECT_STYLES: Record<TaskPriority, string> = {
  High: "border-rose-500/50 bg-rose-500/15 text-rose-400",
  Medium: "border-amber-500/50 bg-amber-500/15 text-amber-400",
  Low: "border-zinc-600 bg-zinc-500/15 text-zinc-400",
};

const FIELD_CLASSNAME =
  "mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500 focus:outline-none";

export interface TaskFormProps {
  mode: "create" | "edit";
  task?: Task;
  defaultDomainId?: string;
  /** 새 작업을 만들 때 미리 골라 둘 스프린트(칸반에서 보고 있던 스프린트). */
  defaultSprintId?: string;
  /** 주어지면(Supabase 모드) 담당자 이름 입력란 대신 이 목록에서 고르는 select를 보여준다. */
  projectMembers?: ProjectMemberOption[];
  /** 주어지면(Supabase 모드) 업무 영역 select가 Zustand 목업 대신 이 실데이터 목록을 쓴다. */
  domains?: WorkDomain[];
  /** Supabase 모드의 활성 프로젝트 id. projectMembers가 주어졌는데 이 값이 없으면 첨부 업로드를 막고 안내한다. */
  projectId?: string | null;
  onClose: () => void;
  onSubmit: (values: TaskFormValues) => void | Promise<void>;
  onRequestDelete?: () => void;
}

export function TaskForm({
  mode,
  task,
  defaultDomainId,
  defaultSprintId,
  projectMembers,
  domains: domainsOverride,
  projectId,
  onClose,
  onSubmit,
  onRequestDelete,
}: TaskFormProps) {
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "Medium");
  const [startDate, setStartDate] = useState(task?.startDate ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 폼이 직접 스프린트 목록을 읽는다 — 어느 화면에서 열어도 기존 스프린트 지정이 유지된다.
  const { sprints } = useSprints(projectId ?? null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isSupabaseMode = Boolean(projectMembers);
  const {
    attachments,
    setAttachments,
    pendingFiles,
    uploadError,
    handleFilesAdded,
    isPending,
    handleDownload,
    resolvePreviewUrl,
  } = useAttachmentUploadState(task?.attachments ?? []);

  const mockDomains = useWorkDomainsStore((state) => state.domains);
  const domains = domainsOverride ?? mockDomains;

  const mockCategories = useSyncedAssetsStore((state) => state.categories);
  const mockSyncedAssets = useSyncedAssetsStore((state) => state.assets);
  const mockSyncAsset = useSyncedAssetsStore((state) => state.syncAsset);
  // 통합 에셋 조회만 필요하다(업로드는 대시보드 위젯 전용) — currentUserId는 null로 넘긴다.
  const supabaseSyncedAssets = useSupabaseSyncedAssets(isSupabaseMode ? (projectId ?? null) : null, null);
  const categories = isSupabaseMode ? supabaseSyncedAssets.categories : mockCategories;
  const syncedAssets = isSupabaseMode ? supabaseSyncedAssets.assets : mockSyncedAssets;

  // itemClassName/renderItemBadge가 첨부마다 findSyncedCategory(O(assets×categories))를
  // 각각 다시 호출하던 것을 한 번의 순회로 미리 계산해 재사용한다.
  const syncedCategoryByAttachmentId = useMemo(() => {
    const map = new Map<string, SyncedAssetCategory>();
    for (const entry of Object.values(syncedAssets)) {
      const category = categories.find((candidate) => candidate.id === entry.categoryId);
      if (category) map.set(entry.attachment.id, category);
    }
    return map;
  }, [syncedAssets, categories]);

  const [syncSelections, setSyncSelections] = useState<Record<string, PendingSync>>(() => {
    const initial: Record<string, PendingSync> = {};
    (task?.attachments ?? []).forEach((attachment) => {
      const synced = findSyncedCategory(syncedAssets, categories, attachment.id);
      if (synced) {
        initial[attachment.id] = { enabled: true, categoryId: synced.id };
      }
    });
    return initial;
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") ?? "");

    const domainId = String(formData.get("domainId") ?? "") || undefined;
    const sprintId = String(formData.get("sprintId") ?? "") || undefined;

    let assigneeId: string | undefined;
    let assigneeName: string;
    let assigneeRole: string;
    if (projectMembers) {
      assigneeId = String(formData.get("assigneeId") ?? "");
      const member = projectMembers.find((candidate) => candidate.id === assigneeId);
      assigneeName = member?.name ?? "";
      assigneeRole = member?.role ?? "";
    } else {
      assigneeName = String(formData.get("assigneeName") ?? "");
      assigneeRole = domains.find((domain) => domain.id === domainId)?.label ?? "";
    }

    const values: TaskFormValues = {
      title,
      assigneeName,
      assigneeRole,
      assigneeId,
      startDate,
      dueDate,
      priority,
      attachments,
      pendingFiles,
      domainId,
      sprintId,
    };

    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "저장하지 못했습니다. 다시 시도해주세요.");
      setIsSubmitting(false);
      return;
    }

    // 저장(Supabase 모드면 pendingFiles 업로드까지)이 끝난 뒤에 동기화한다 — 이
    // 시점엔 이 폼에서 방금 새로 첨부한 파일도 이미 attachments 테이블에 저장돼
    // 있어 asset_syncs.attachment_id FK가 깨지지 않는다. 작업 저장과 무관한 부가
    // 기능이라 실패해도 저장 자체는 이미 성공했으므로 조용히 넘어간다.
    Object.entries(syncSelections).forEach(([attachmentId, selection]) => {
      if (!selection.enabled || !selection.categoryId) return;
      const attachment = attachments.find((item) => item.id === attachmentId);
      if (!attachment) return;

      if (isSupabaseMode) {
        syncExistingAttachment(getBrowserSupabaseClient(), selection.categoryId, attachmentId, title).catch(() => {
          // 실패하면 이 작업을 다시 열어 토글을 재시도할 수 있다.
        });
      } else {
        mockSyncAsset(selection.categoryId, attachment, title);
      }
    });
  }

  const defaultAssigneeId = projectMembers?.find((member) => member.name === task?.assignee.name)?.id ?? "";

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-50">
          {mode === "create" ? "새 작업 추가" : "작업 수정"}
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
            작업 제목
          </label>
          <input
            id="title"
            name="title"
            required
            defaultValue={task?.title}
            placeholder="예: 슬라임 몬스터 돌진 AI FSM 구현"
            className={FIELD_CLASSNAME}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor={projectMembers ? "assigneeId" : "assigneeName"} className="text-sm font-medium text-zinc-400">
              담당자
            </label>
            {projectMembers ? (
              <Select
                id="assigneeId"
                name="assigneeId"
                required
                defaultValue={defaultAssigneeId}
                placeholder="담당자 선택"
                options={projectMembers.map((member) => ({ value: member.id, label: member.name }))}
                className={FIELD_CLASSNAME}
              />
            ) : (
              <input
                id="assigneeName"
                name="assigneeName"
                required
                defaultValue={task?.assignee.name}
                placeholder="예: 김도윤"
                className={FIELD_CLASSNAME}
              />
            )}
          </div>

          <div>
            <label htmlFor="domainId" className="text-sm font-medium text-zinc-400">
              업무 영역
            </label>
            <Select
              id="domainId"
              name="domainId"
              defaultValue={task?.domainId ?? defaultDomainId ?? ""}
              options={[
                { value: "", label: "미지정" },
                ...domains.map((domain) => ({ value: domain.id, label: domain.label })),
              ]}
              className={FIELD_CLASSNAME}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-zinc-400">시작일</label>
            <div className="mt-1.5">
              <DatePicker value={startDate} onChange={setStartDate} placeholder="시작일 선택" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-400">마감일</label>
            <div className="mt-1.5">
              <DatePicker value={dueDate} onChange={setDueDate} placeholder="마감일 선택" />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="sprintId" className="text-sm font-medium text-zinc-400">
            스프린트
          </label>
          <Select
            id="sprintId"
            name="sprintId"
            defaultValue={task ? task.sprintId ?? "" : defaultSprintId ?? ""}
            options={[
              { value: "", label: "백로그 (스프린트 없음)" },
              ...sprints.map((sprint) => ({
                value: sprint.id,
                label: (
                  <>
                    {sprint.name} <span className="text-zinc-500">· {formatSprintRange(sprint)}</span>
                  </>
                ),
              })),
            ]}
            className={FIELD_CLASSNAME}
          />
        </div>

        <div>
          <span className="text-sm font-medium text-zinc-400">첨부파일</span>
          <div className="mt-1.5">
            {isSupabaseMode && !projectId ? (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-400">
                활성 프로젝트가 없어 첨부파일을 업로드할 수 없습니다.
              </p>
            ) : (
              <AttachmentPicker
                attachments={attachments}
                onChange={setAttachments}
                disabled={isSubmitting}
                onFilesAdded={isSupabaseMode ? handleFilesAdded : undefined}
                onDownload={isSupabaseMode ? handleDownload : undefined}
                onResolvePreviewUrl={isSupabaseMode ? resolvePreviewUrl : undefined}
                itemClassName={(attachment) => {
                  const synced = syncedCategoryByAttachmentId.get(attachment.id);
                  return synced
                    ? "border-cyan-500/40 bg-cyan-500/[0.06]"
                    : "border-zinc-800 bg-zinc-950/50";
                }}
                renderItemBadge={(attachment) => {
                  const synced = syncedCategoryByAttachmentId.get(attachment.id);
                  const pending = isSupabaseMode && isPending(attachment.id);
                  if (!synced && !pending) return null;
                  return (
                    <>
                      {synced && (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[11px] font-medium text-cyan-400">
                          <RefreshCw className="h-3 w-3" />
                          {synced.label}
                        </span>
                      )}
                      {pending && (
                        <span className="shrink-0 rounded-full bg-zinc-700/60 px-2 py-0.5 text-[11px] font-medium text-zinc-300">
                          {isSubmitting ? "업로드 중..." : "업로드 대기"}
                        </span>
                      )}
                    </>
                  );
                }}
                renderItemExtra={(attachment) => (
                  <AttachmentSyncToggle
                    pending={syncSelections[attachment.id] ?? { enabled: false, categoryId: null }}
                    onChange={(next) =>
                      setSyncSelections((prev) => ({ ...prev, [attachment.id]: next }))
                    }
                    categories={isSupabaseMode ? categories : undefined}
                  />
                )}
              />
            )}
            {uploadError && <p className="mt-2 text-sm text-red-400">{uploadError}</p>}
          </div>
        </div>

        <div>
          <span className="text-sm font-medium text-zinc-400">우선순위</span>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {PRIORITIES.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setPriority(level)}
                className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors active:scale-95 ${
                  priority === level
                    ? PRIORITY_SELECT_STYLES[level]
                    : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-700"
                }`}
              >
                {level}
              </button>
            ))}
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
              {isSubmitting ? "저장 중..." : submitError ? "다시 시도" : mode === "create" ? "작업 추가" : "저장"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
