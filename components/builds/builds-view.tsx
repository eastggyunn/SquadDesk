"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Github, Info, Package, Plus } from "lucide-react";
import type { ProjectRepositoryRow } from "@/lib/supabase/schema";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useActiveProject } from "@/lib/supabase/use-active-project";
import { useProjectRepositories } from "@/lib/supabase/hooks/use-project-repositories";
import { useProjectMembers } from "@/lib/supabase/hooks/use-project-members";
import { useProjectBuilds } from "@/lib/supabase/hooks/use-project-builds";
import { useBuildLinks } from "@/lib/supabase/hooks/use-build-links";
import { useLinkableTasks } from "@/lib/supabase/hooks/use-linkable-tasks";
import { useSprints } from "@/lib/hooks/use-sprints";
import { GITHUB_CONNECT_ERRORS } from "@/lib/github/connect-cookie";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorAlert } from "@/components/ui/error-alert";
import { primaryButton } from "@/components/ui/button-styles";
import { SPRING } from "@/lib/motion";
import { ALL_SPRINTS, BuildList } from "./build-list";
import { ConnectRepositoryModal } from "./connect-repository-modal";

const BUILD_SOURCE_LABELS: Record<ProjectRepositoryRow["build_source"], string> = {
  artifact: "Actions artifact",
  release: "Release",
  both: "Artifact + Release",
};

/** 다운로드 라우트(/api/builds/[id]/download)가 돌려보낼 때 붙이는 ?download= 사유. */
const DOWNLOAD_ERRORS: Record<string, string> = {
  expired: "보관 기간이 지난 빌드라 다운로드할 수 없습니다.",
  disconnected: "저장소 연결이 해제되어 이 빌드를 다운로드할 수 없습니다.",
  not_found: "빌드를 찾을 수 없습니다. 이 프로젝트의 멤버인지 확인해주세요.",
  error: "다운로드 주소를 받지 못했습니다. 잠시 후 다시 시도해주세요.",
};

export function BuildsView() {
  const supabaseMode = isSupabaseConfigured();
  const { isGuest } = useCurrentUser();
  const { activeProject } = useActiveProject();
  const projectId = supabaseMode ? (activeProject?.id ?? null) : null;
  const { repositories, installations, isLoading, error, reload } = useProjectRepositories(projectId);
  const members = useProjectMembers(projectId);
  const { builds, isLoading: isLoadingBuilds, error: buildsError } = useProjectBuilds(projectId);
  const { links, error: linksError, link, unlink } = useBuildLinks(projectId);
  const tasks = useLinkableTasks(projectId);
  const { sprints } = useSprints(projectId);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [modalInstallationId, setModalInstallationId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const [connectedMessage, setConnectedMessage] = useState<string | null>(null);
  const [highlightBuildId, setHighlightBuildId] = useState<string | null>(null);
  const [sprintFilter, setSprintFilter] = useState(ALL_SPRINTS);

  // 설치 콜백(?connect= / ?github=), 다운로드 실패(?download=), 빌드 알림(?build=),
  // 칸반의 "빌드 N개"(?sprint=)가 붙인 값을 한 번 읽고 주소에서 지운다.
  useEffect(() => {
    const connect = searchParams.get("connect");
    const githubError = searchParams.get("github");
    const downloadError = searchParams.get("download");
    const buildId = searchParams.get("build");
    const sprintId = searchParams.get("sprint");
    if (!connect && !githubError && !downloadError && !buildId && !sprintId) return;
    if (sprintId) setSprintFilter(sprintId);
    if (downloadError) setCallbackError(DOWNLOAD_ERRORS[downloadError] ?? DOWNLOAD_ERRORS.error);
    if (buildId) setHighlightBuildId(buildId);
    if (connect && Number(connect) > 0) {
      setModalInstallationId(Number(connect));
      setIsModalOpen(true);
      void reload();
    }
    if (githubError) setCallbackError(GITHUB_CONNECT_ERRORS[githubError] ?? GITHUB_CONNECT_ERRORS.auth);
    router.replace(pathname);
  }, [searchParams, router, pathname, reload]);

  if (!supabaseMode) {
    return <Notice>빌드 연동은 실제 Supabase 연결이 필요합니다.</Notice>;
  }
  if (!projectId) {
    return <Notice>소속된 프로젝트가 없습니다. 프로젝트 관리자에게 초대를 요청해주세요.</Notice>;
  }

  const activeRepositories = repositories.filter((repo) => !repo.disconnected_at);
  const memberName = (userId: string | null) => members.find((member) => member.id === userId)?.name ?? "알 수 없음";

  function openModal() {
    setModalInstallationId(null);
    setConnectedMessage(null);
    setIsModalOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="빌드"
        description="GitHub에 push하면 성공한 CI 빌드가 자동으로 올라옵니다."
        action={
          <button type="button" onClick={openModal} disabled={isGuest} className={primaryButton}>
            <Plus className="h-4 w-4" />
            저장소 연결
          </button>
        }
      />

      {isGuest && <Notice>게스트 모드에서는 GitHub을 연결할 수 없습니다. 가입 후 이용해주세요.</Notice>}
      <ErrorAlert message={callbackError ?? error ?? buildsError ?? linksError} />
      <AnimatePresence initial={false}>
        {connectedMessage && (
          <motion.div
            key="connected-message"
            // 부모 flex gap(24px)까지 함께 접어야 목록이 한 번에 부드럽게 밀린다.
            initial={{ height: 0, opacity: 0, marginTop: -24 }}
            animate={{ height: "auto", opacity: 1, marginTop: 0 }}
            exit={{ height: 0, opacity: 0, marginTop: -24 }}
            transition={SPRING.collapse}
            className="overflow-hidden"
          >
            <p className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {connectedMessage}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {repositories.length === 0 ? (
        !isLoading && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-800 px-6 py-14 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-800/60 text-zinc-400">
              <Package className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium text-zinc-200">아직 연결된 저장소가 없습니다</p>
              <p className="mt-1 text-xs text-zinc-500">
                GitHub 저장소를 연결하면 push할 때마다 성공한 빌드가 여기에 자동으로 올라옵니다.
              </p>
            </div>
          </div>
        )
      ) : (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-zinc-300">연결된 저장소</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {repositories.map((repo) => (
              <li
                key={repo.id}
                className={`rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 ${repo.disconnected_at ? "opacity-50" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <Github className="h-4 w-4 shrink-0 text-zinc-400" />
                  <a
                    href={`https://github.com/${repo.repo_full_name}`}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-sm font-medium text-zinc-100 hover:text-cyan-400"
                  >
                    {repo.repo_full_name}
                  </a>
                  {repo.disconnected_at && <span className="shrink-0 text-xs text-zinc-500">연결 해제됨</span>}
                </div>
                <p className="mt-1 truncate text-xs text-zinc-500">
                  {BUILD_SOURCE_LABELS[repo.build_source]}
                  {repo.workflow_path && ` · ${repo.workflow_path.split("/").pop()}`}
                  {repo.branch_filter && ` · ${repo.branch_filter}`}
                  {` · 연결: ${memberName(repo.connected_by)}`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {repositories.length > 0 && (
        <BuildList
          builds={builds}
          repositories={repositories}
          isLoading={isLoadingBuilds}
          highlightBuildId={highlightBuildId}
          links={links}
          tasks={tasks}
          sprints={sprints}
          sprintFilter={sprintFilter}
          onSprintFilterChange={setSprintFilter}
          onLink={(buildId, target) => void link(buildId, target)}
          onUnlink={(linkId) => void unlink(linkId)}
        />
      )}

      <ConnectRepositoryModal
        open={isModalOpen}
        projectId={projectId}
        installations={installations}
        initialInstallationId={modalInstallationId}
        connectedRepoIds={activeRepositories.map((repo) => repo.repo_id)}
        onClose={() => setIsModalOpen(false)}
        onConnected={(importedBuilds) => {
          setIsModalOpen(false);
          setConnectedMessage(
            importedBuilds > 0
              ? `저장소를 연결했습니다. 최근 빌드 ${importedBuilds}개를 가져왔습니다.`
              : "저장소를 연결했습니다. 다음 빌드부터 자동으로 올라옵니다."
          );
          void reload();
        }}
      />
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
      <p className="text-sm text-zinc-400">{children}</p>
    </div>
  );
}
