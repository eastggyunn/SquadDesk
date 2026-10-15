"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActiveProject } from "@/lib/supabase/use-active-project";

/**
 * 알림 링크(종 아이콘·메일 요약)는 ?project=<id>를 단다 — 다른 프로젝트의 작업/버그/채널이라도
 * 먼저 그 프로젝트로 바꿔 두면, 각 화면의 ?task/?bug/?channel 딥링크가 목록이 들어온 뒤 대상을 연다.
 * 멤버가 아닌 프로젝트 id면 useActiveProject가 첫 활성 프로젝트로 되돌린다.
 */
export function ProjectFromUrl() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");
  const pathname = usePathname();
  const router = useRouter();
  const { setActiveProjectId } = useActiveProject();

  // 적용한 뒤 ?project만 주소에서 지운다 — 새로고침·공유 링크가 프로젝트를 다시 바꾸지 않게.
  useEffect(() => {
    if (!projectId) return;
    setActiveProjectId(projectId);
    const rest = new URLSearchParams(searchParams);
    rest.delete("project");
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [projectId, searchParams, pathname, router, setActiveProjectId]);

  return null;
}
