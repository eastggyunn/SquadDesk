import { FolderX } from "lucide-react";

/**
 * 로그인은 했지만 활성 프로젝트가 하나도 없는 사용자에게 보여주는 안내.
 * 보관된 프로젝트만 남은 경우도 같은 흐름을 쓰되, 복원 경로를 함께 알려준다 — 복원은 owner만 할 수 있으므로
 * 복원할 수 있는 보관 프로젝트가 없으면 owner에게 요청하라고 안내한다.
 */
export function NoProjectBanner({
  hasArchivedProjects = false,
  canRestoreArchived = false,
}: {
  hasArchivedProjects?: boolean;
  canRestoreArchived?: boolean;
}) {
  return (
    <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.03] px-4 py-3">
      <FolderX className="h-4 w-4 shrink-0 text-amber-400" />
      <p className="text-sm text-zinc-300">
        {hasArchivedProjects && canRestoreArchived ? (
          <>
            활성 프로젝트가 없습니다. 사이드바 &ldquo;보관됨&rdquo; 목록에서 프로젝트를 복원하거나, + 버튼으로
            새 프로젝트를 만들어주세요.
          </>
        ) : hasArchivedProjects ? (
          <>
            활성 프로젝트가 없습니다. 보관된 프로젝트는 owner만 복원할 수 있으니 owner에게 복원을 요청하거나, + 버튼으로
            새 프로젝트를 만들어주세요.
          </>
        ) : (
          <>
            아직 배정된 프로젝트가 없습니다. 사이드바 &ldquo;프로젝트&rdquo;의 + 버튼으로 새 프로젝트를 만들거나,
            기존 팀의 owner에게 초대 링크를 요청해주세요.
          </>
        )}
      </p>
    </div>
  );
}
