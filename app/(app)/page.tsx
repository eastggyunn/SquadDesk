"use client";

import { HydrationGate } from "@/components/ui/hydration-gate";
import { PageHeader } from "@/components/layout/page-header";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { useActiveProject } from "@/lib/supabase/use-active-project";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useDashboardData } from "@/lib/supabase/hooks/use-dashboard-data";
import { useTasksStore } from "@/lib/store/tasks-store";
import { useBugsStore } from "@/lib/store/bugs-store";
import { ProjectHealthWidget } from "@/components/dashboard/project-health-widget";
import { MyTasksWidget } from "@/components/dashboard/my-tasks-widget";
import { CriticalBugsWidget } from "@/components/dashboard/critical-bugs-widget";
import { RecentActivityWidget } from "@/components/dashboard/recent-activity-widget";
import { SyncedAssetsWidget } from "@/components/dashboard/synced-assets-widget";

/** 활성 프로젝트가 있으면 프로젝트 이름을, 없으면(로컬 데모 등) 툴 이름을 제목으로 쓴다. */
function DashboardTitle() {
  const supabaseMode = isSupabaseConfigured();
  const { activeProject } = useActiveProject();
  return <>{(supabaseMode ? activeProject?.name : null) ?? "SquadDesk"} 대시보드</>;
}

/**
 * 대시보드 본문. tasks/bugs/activity는 useDashboardData 한 번으로만 가져와
 * ProjectHealthWidget · MyTasksWidget · CriticalBugsWidget · RecentActivityWidget이
 * 나눠 쓴다 — 예전에는 위젯마다 각자 조회해 같은 작업/버그 목록을 최대 3번
 * 중복 요청했다. 칸반/버그 화면의 CRUD 훅(useSupabaseTasks/useSupabaseBugs)은
 * 건드리지 않는다 — 이 훅은 대시보드 전용 읽기 경로다.
 *
 * 활성 프로젝트가 없으면(Supabase 모드) AppLayout의 NoProjectBanner가 이미
 * 안내하므로, 여기서는 위젯을 아예 렌더링하지 않는다 — 위젯마다 같은
 * "소속된 프로젝트가 없습니다" 문구를 반복하지 않기 위해서다.
 */
function DashboardBody() {
  const supabaseMode = isSupabaseConfigured();
  const currentUser = useCurrentUser();
  const { activeProject } = useActiveProject();
  const activeProjectId = supabaseMode ? (activeProject?.id ?? null) : null;

  const mockTasks = useTasksStore((state) => state.tasks);
  const mockBugs = useBugsStore((state) => state.bugs);
  const dashboard = useDashboardData(activeProjectId);

  const tasks = supabaseMode ? dashboard.tasks : mockTasks;
  const bugs = supabaseMode ? dashboard.bugs : mockBugs;
  const isLoading = supabaseMode && dashboard.isLoading;
  const dataError = supabaseMode ? dashboard.error : null;

  if (supabaseMode && !activeProjectId) return null;

  return (
    <>
      <ProjectHealthWidget
        tasks={tasks}
        bugs={bugs}
        currentUserName={currentUser.assignee.name}
        isLoading={isLoading}
        error={dataError}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MyTasksWidget
          tasks={tasks}
          currentUserName={currentUser.assignee.name}
          isLoading={isLoading}
          error={dataError}
        />
        <CriticalBugsWidget bugs={bugs} isLoading={isLoading} error={dataError} />
        <RecentActivityWidget
          supabaseMode={supabaseMode}
          activity={dashboard.activity}
          isLoading={isLoading}
          error={dataError}
        />
      </div>

      <SyncedAssetsWidget />
    </>
  );
}

export default function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          <HydrationGate>
            <DashboardTitle />
          </HydrationGate>
        }
        description="팀 프로젝트 현황을 한눈에 확인하세요."
      />

      <HydrationGate>
        <DashboardBody />
      </HydrationGate>
    </div>
  );
}
