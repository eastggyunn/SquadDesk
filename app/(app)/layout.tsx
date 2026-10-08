import { Sidebar } from "@/components/layout/sidebar";
import { NoProjectBanner } from "@/components/layout/no-project-banner";
import { TopBar } from "@/components/layout/top-bar";
import { DepthContainer } from "@/components/layout/depth-container";
import { CurrentUserProvider } from "@/components/providers/current-user-provider";
import { getCurrentUser } from "@/lib/supabase/current-user";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const currentUser = await getCurrentUser();

  return (
    <CurrentUserProvider value={currentUser}>
      <DepthContainer>
      <div className="flex min-h-screen">
        <Sidebar currentUser={currentUser} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-6 pb-8 pt-5 lg:px-10">
            <TopBar />
            {/* 보관된 프로젝트만 남은 경우도 "활성 프로젝트 없음"이다 — 같은 배너 흐름을 쓴다. */}
            {currentUser && currentUser.projects.every((project) => project.isArchived) && (
              <NoProjectBanner
                hasArchivedProjects={currentUser.projects.length > 0}
                canRestoreArchived={currentUser.projects.some((project) => project.role === "owner")}
              />
            )}
            {children}
          </div>
        </main>
      </div>
      </DepthContainer>
    </CurrentUserProvider>
  );
}
