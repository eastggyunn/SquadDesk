"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Github, Lock, Plus } from "lucide-react";
import type { GitHubInstallationRow } from "@/lib/supabase/schema";
import {
  connectRepository,
  listConnectableRepositories,
  listRepositoryWorkflowOptions,
  startGitHubInstall,
  type ConnectableRepository,
  type RepositoryWorkflow,
} from "@/lib/github/connect-actions";
import { ErrorAlert } from "@/components/ui/error-alert";
import { ModalPortal } from "@/components/ui/modal-portal";
import { primaryButton, secondaryButton } from "@/components/ui/button-styles";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";
import { FADE, SPRING } from "@/lib/motion";
import { useOverlayDepth } from "@/lib/store/overlay-store";
import { ALL_WORKFLOWS, RepositoryFilterFields, type RepositoryFilterValues } from "./repository-filter-fields";

interface ConnectRepositoryModalProps {
  open: boolean;
  projectId: string;
  installations: GitHubInstallationRow[];
  /** 설치 콜백에서 막 돌아왔을 때 그 계정으로 바로 저장소 선택을 연다. */
  initialInstallationId: number | null;
  /** 이 프로젝트에 이미 연결된(해제되지 않은) 저장소 id — 목록에서 비활성 처리한다. */
  connectedRepoIds: number[];
  onClose: () => void;
  onConnected: (importedBuilds: number) => void;
}

const STEPS = ["account", "repository", "settings"] as const;

/** 단계 본문 전환: 나간 뒤 들어온다(mode="wait") — 높이가 바뀌는 순간이 내용이 비어 있을 때라 덜컥거리지 않는다. */
const stepVariants = {
  enter: (direction: number) => ({ opacity: 0, x: 8 * direction }),
  center: { opacity: 1, x: 0, transition: SPRING.popover },
  exit: (direction: number) => ({
    opacity: 0,
    x: -8 * direction,
    transition: SPRING.exit,
  }),
};

/** 저장소 연결 모달: GitHub 계정 → 저장소 → 받을 빌드 범위 + 공개 동의. */
export function ConnectRepositoryModal({ open, ...props }: ConnectRepositoryModalProps) {
  useOverlayDepth(open);
  return (
    <ModalPortal>
      <AnimatePresence>{open && <ConnectRepositoryModalContent {...props} />}</AnimatePresence>
    </ModalPortal>
  );
}

function ConnectRepositoryModalContent({
  projectId,
  installations,
  initialInstallationId,
  connectedRepoIds,
  onClose,
  onConnected,
}: Omit<ConnectRepositoryModalProps, "open">) {
  const shouldReduceMotion = useReducedMotion();
  useEscapeKey(onClose);

  const [installationId, setInstallationId] = useState<number | null>(
    initialInstallationId ?? (installations.length === 1 ? installations[0].installation_id : null)
  );
  const [repositories, setRepositories] = useState<ConnectableRepository[] | null>(null);
  const [repository, setRepository] = useState<ConnectableRepository | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    if (installationId === null) return;
    let cancelled = false;
    setRepositories(null);
    setError(null);
    listConnectableRepositories(projectId, installationId).then((result) => {
      if (cancelled) return;
      if (result.ok) setRepositories(result.repositories);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, installationId]);

  async function handleAddAccount() {
    setIsRedirecting(true);
    const result = await startGitHubInstall(projectId);
    if (result.ok) {
      window.location.assign(result.url);
    } else {
      setError(result.error);
      setIsRedirecting(false);
    }
  }

  const step = installationId === null ? "account" : repository === null ? "repository" : "settings";
  const account = installations.find((item) => item.installation_id === installationId);

  // 앞 단계로 가면 오른쪽에서, 뒤로 가면 왼쪽에서 들어온다 — 단계 순서를 공간으로 보여준다.
  const stepIndex = STEPS.indexOf(step);
  const previousStepIndex = useRef(stepIndex);
  const direction = stepIndex >= previousStepIndex.current ? 1 : -1;
  useEffect(() => {
    previousStepIndex.current = stepIndex;
  }, [stepIndex]);

  return (
    <>
      <motion.div
        key="connect-repository-backdrop"
        className="fixed inset-0 z-[70] bg-black/70"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={FADE}
        onClick={onClose}
      />

      <motion.div
        key="connect-repository-panel"
        className="fixed inset-0 z-[70] flex items-center justify-center p-4"
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, transition: SPRING.exit }}
        transition={SPRING.modal}
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="connect-repository-title"
          onClick={(event) => event.stopPropagation()}
          className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-400">
              <Github className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 id="connect-repository-title" className="text-sm font-semibold text-zinc-100">
                GitHub 저장소 연결
              </h2>
              <p className="truncate text-xs text-zinc-500">
                {step === "account"
                  ? "빌드를 가져올 GitHub 계정을 고르세요."
                  : step === "repository"
                    ? `${account?.account_login ?? "GitHub"} 계정의 저장소`
                    : repository?.fullName}
              </p>
            </div>
          </div>

          <ErrorAlert message={error} className="mt-4 !text-xs" />

          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
            >
              {step === "account" && (
                <div className="mt-4 flex flex-col gap-2">
                  {installations.map((item) => (
                    <button
                      key={item.installation_id}
                      type="button"
                      onClick={() => setInstallationId(item.installation_id)}
                      className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-2.5 text-left text-sm text-zinc-200 transition-[transform,background-color] duration-150 hover:bg-zinc-800 active:scale-[0.99]"
                    >
                      <span className="truncate">{item.account_login}</span>
                      <span className="text-xs text-zinc-500">
                        {item.account_type === "Organization" ? "조직" : "개인"}
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleAddAccount}
                    disabled={isRedirecting}
                    className={`${secondaryButton} mt-1`}
                  >
                    <Plus className="h-4 w-4" />
                    {isRedirecting ? "GitHub으로 이동 중..." : "GitHub 계정에 앱 설치하기"}
                  </button>
                  <p className="text-[11px] leading-relaxed text-zinc-600">
                    GitHub에서 SquadDesk Builds 앱을 설치하고 연결할 저장소를 고르면 이 화면으로 돌아옵니다. 앱은
                    Actions·Release를 읽기만 합니다.
                  </p>
                </div>
              )}

              {step === "repository" && (
                <div className="mt-4">
                  {repositories === null && !error ? (
                    <p className="py-6 text-center text-xs text-zinc-500">저장소 목록을 불러오는 중...</p>
                  ) : repositories && repositories.length === 0 ? (
                    <p className="py-6 text-center text-xs text-zinc-500">
                      이 계정에서 앱에 허용한 저장소가 없습니다. GitHub에서 앱 설정의 저장소 접근 범위를 확인해주세요.
                    </p>
                  ) : (
                    <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
                      {(repositories ?? []).map((repo) => {
                        const isConnected = connectedRepoIds.includes(repo.id);
                        return (
                          <li key={repo.id}>
                            <button
                              type="button"
                              disabled={isConnected}
                              onClick={() => setRepository(repo)}
                              className="flex w-full items-center justify-between gap-3 rounded-lg border border-zinc-800 px-3 py-2.5 text-left text-sm text-zinc-200 transition-[transform,background-color] duration-150 hover:bg-zinc-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:active:scale-100"
                            >
                              <span className="flex min-w-0 items-center gap-1.5">
                                {repo.isPrivate && <Lock className="h-3.5 w-3.5 shrink-0 text-zinc-500" />}
                                <span className="truncate">{repo.fullName}</span>
                              </span>
                              {isConnected && <span className="shrink-0 text-xs text-zinc-500">이미 연결됨</span>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div className="mt-4 flex gap-2">
                    {installations.length > 1 || initialInstallationId === null ? (
                      <button
                        type="button"
                        onClick={() => setInstallationId(null)}
                        className={`flex-1 ${secondaryButton}`}
                      >
                        <ArrowLeft className="h-4 w-4" />
                        계정 선택
                      </button>
                    ) : (
                      <button type="button" onClick={onClose} className={`flex-1 ${secondaryButton}`}>
                        취소
                      </button>
                    )}
                  </div>
                </div>
              )}

              {step === "settings" && repository && installationId !== null && (
                <RepositorySettingsForm
                  projectId={projectId}
                  installationId={installationId}
                  repository={repository}
                  onBack={() => setRepository(null)}
                  onError={setError}
                  onConnected={onConnected}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
}

function RepositorySettingsForm({
  projectId,
  installationId,
  repository,
  onBack,
  onError,
  onConnected,
}: {
  projectId: string;
  installationId: number;
  repository: ConnectableRepository;
  onBack: () => void;
  onError: (message: string | null) => void;
  onConnected: (importedBuilds: number) => void;
}) {
  const [workflows, setWorkflows] = useState<RepositoryWorkflow[] | null>(null);
  const [filters, setFilters] = useState<RepositoryFilterValues>({
    buildSource: "artifact",
    workflowPath: ALL_WORKFLOWS,
    branch: repository.defaultBranch,
  });
  const [consented, setConsented] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listRepositoryWorkflowOptions(projectId, installationId, repository.id).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setWorkflows(result.workflows);
        // 워크플로가 하나뿐이면 그것을 기본으로 고른다(대부분의 게임 저장소가 빌드 워크플로 하나다).
        if (result.workflows.length === 1) {
          const onlyPath = result.workflows[0].path;
          setFilters((current) => ({ ...current, workflowPath: onlyPath }));
        }
      } else {
        setWorkflows([]);
        onError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, installationId, repository.id, onError]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!consented || isSubmitting) return;
    setIsSubmitting(true);
    onError(null);
    const result = await connectRepository({
      projectId,
      installationId,
      repoId: repository.id,
      buildSource: filters.buildSource,
      workflowPath: filters.workflowPath || null,
      branchFilter: filters.branch,
    });
    if (result.ok) {
      onConnected(result.importedBuilds);
    } else {
      onError(result.error);
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
      <RepositoryFilterFields values={filters} onChange={setFilters} workflows={workflows} />

      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
        <input
          type="checkbox"
          checked={consented}
          onChange={(event) => setConsented(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-500"
        />
        <span className="text-xs leading-relaxed text-amber-300">
          이 프로젝트의 멤버 전원이 GitHub 권한 없이도 이 저장소의 빌드를 다운로드할 수 있습니다.
        </span>
      </label>

      <div className="flex gap-2">
        <button type="button" onClick={onBack} className={`flex-1 ${secondaryButton}`}>
          <ArrowLeft className="h-4 w-4" />
          저장소 선택
        </button>
        <button type="submit" disabled={!consented || isSubmitting} className={`flex-1 ${primaryButton}`}>
          {isSubmitting ? "연결 중..." : "연결하기"}
        </button>
      </div>
    </form>
  );
}
