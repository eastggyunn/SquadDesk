"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Archive, ChevronRight, Pencil, Plus, RotateCcw } from "lucide-react";
import { useActiveProject } from "@/lib/supabase/use-active-project";
import { useProjectMutations } from "@/lib/supabase/hooks/use-project-mutations";
import { ErrorAlert } from "@/components/ui/error-alert";
import { DeleteConfirmModal } from "@/components/kanban/delete-confirm-modal";
import { ProjectFormModal, type ProjectFormMode } from "./project-form-modal";
import { SPRING } from "@/lib/motion";

const PROJECT_COLORS = ["bg-cyan-400", "bg-amber-400", "bg-emerald-400", "bg-rose-400", "bg-violet-400"];

/** 프로젝트마다 고정된 색 — id에서 뽑아 새로고침해도 바뀌지 않는다. */
function getProjectColor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash + char.charCodeAt(0)) % PROJECT_COLORS.length;
  return PROJECT_COLORS[hash];
}

/**
 * 사이드바의 프로젝트 선택 + 생성/이름 변경/보관/복원. owner가 아니면 이름 변경·보관·
 * 복원 버튼을 감춘다 — 실제 차단은 RPC(archive_project 등)와 projects RLS가 한다.
 * 보관된 프로젝트는 활성 선택 목록에서 분리해 접이식 목록으로만 보여준다.
 */
export function ProjectSwitcher() {
  const { projects, archivedProjects, activeProject, setActiveProjectId } = useActiveProject();
  const { create, rename, archive, restore, error, isSubmitting, clearError } = useProjectMutations();

  const [mode, setMode] = useState<ProjectFormMode | null>(null);
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const isOwner = activeProject?.role === "owner";
  // 이름 변경 중 활성 프로젝트가 사라졌다면(멤버 제거 등) 대상이 없으므로 제출하지 않는다.
  const renameTarget = mode === "rename" ? activeProject : null;

  function openForm(nextMode: ProjectFormMode) {
    clearError();
    setMode(nextMode);
  }

  function closeForm() {
    clearError();
    setMode(null);
  }

  async function handleSubmit(name: string) {
    if (isSubmitting || mode === null || (mode === "rename" && !renameTarget)) return;

    const ok = renameTarget ? await rename(renameTarget.id, name) : await create(name);
    if (ok) closeForm();
  }

  async function handleArchive() {
    if (!activeProject) return;
    setIsArchiveConfirmOpen(false);
    // 보관하면 목록에서 빠지므로, 접어 둔 보관 목록을 펼쳐 어디로 갔는지 보여준다.
    if (await archive(activeProject.id)) setShowArchived(true);
  }

  return (
    <div className="border-t border-zinc-800/80 px-4 pb-1 pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-zinc-500">프로젝트</span>

        <div className="flex items-center gap-0.5">
          {isOwner && (
            <>
              <IconButton label="프로젝트 이름 변경" onClick={() => openForm("rename")}>
                <Pencil className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                label="프로젝트 보관"
                onClick={() => {
                  clearError();
                  setIsArchiveConfirmOpen(true);
                }}
              >
                <Archive className="h-3.5 w-3.5" />
              </IconButton>
            </>
          )}
          <IconButton label="새 프로젝트" onClick={() => openForm("create")}>
            <Plus className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      {projects.length > 0 ? (
        <ul className="mt-1.5 max-h-36 space-y-0.5 overflow-y-auto" aria-label="활성 프로젝트">
          {projects.map((project) => {
            const isActive = project.id === activeProject?.id;
            return (
              <li key={project.id}>
                <button
                  type="button"
                  onClick={() => setActiveProjectId(project.id)}
                  aria-current={isActive ? "true" : undefined}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                    isActive ? "bg-zinc-800/70 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200"
                  }`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-[3px] ${getProjectColor(project.id)}`} />
                  <span className="truncate">{project.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-zinc-600">활성 프로젝트가 없습니다</p>
      )}

      {archivedProjects.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowArchived((value) => !value)}
            aria-expanded={showArchived}
            className="flex w-full items-center gap-1 rounded-md py-1 text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                showArchived ? "rotate-90" : ""
              }`}
            />
            보관됨 {archivedProjects.length}
          </button>

          <AnimatePresence initial={false}>
            {showArchived && (
              <motion.ul
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={SPRING.collapse}
                className="overflow-hidden"
              >
                {archivedProjects.map((project) => (
                  <li key={project.id} className="flex items-center gap-1 py-0.5">
                    <span className="min-w-0 flex-1 truncate text-xs text-zinc-500" title={project.name}>
                      {project.name}
                    </span>
                    {/* 역할은 프로젝트마다 다르다 — 그 프로젝트의 owner에게만 복원 버튼을 준다. */}
                    {project.role === "owner" && (
                      <IconButton label={`${project.name} 복원`} onClick={() => restore(project.id)}>
                        <RotateCcw className="h-3 w-3" />
                      </IconButton>
                    )}
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* 생성/이름 변경 오류는 그 모달 안에서 보여준다 — 여기서는 보관·복원 오류만 맡는다. */}
      {mode === null && <ErrorAlert message={error} className="mt-2 !px-2.5 !py-2 !text-xs" />}

      <ProjectFormModal
        open={mode !== null}
        mode={mode ?? "create"}
        initialName={mode === "rename" ? (activeProject?.name ?? "") : ""}
        // 중복 판정 범위는 DB 트리거와 같다 — "내가 속한 활성 프로젝트들". 이름 변경 시에는
        // 대상 프로젝트 자신을 빼야 자기 이름으로 되돌리는 것이 막히지 않는다.
        otherProjectNames={projects
          .filter((project) => project.id !== renameTarget?.id)
          .map((project) => project.name)}
        submitError={error}
        isSubmitting={isSubmitting}
        onDirty={clearError}
        onSubmit={handleSubmit}
        onClose={closeForm}
      />

      <DeleteConfirmModal
        open={isArchiveConfirmOpen}
        tone="neutral"
        confirmLabel="보관"
        description={`'${activeProject?.name ?? ""}' 프로젝트를 보관하시겠습니까?`}
        helperText="작업·버그·채팅·첨부 파일은 그대로 남고, 보관 중에는 읽기 전용이 됩니다. owner가 언제든 복원할 수 있습니다."
        onCancel={() => setIsArchiveConfirmOpen(false)}
        onConfirm={handleArchive}
      />
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded-md p-1.5 text-zinc-500 transition-[color,background-color,transform] duration-150 hover:bg-zinc-800 hover:text-zinc-200 active:scale-[0.97]"
    >
      {children}
    </button>
  );
}
