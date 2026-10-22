import { NextResponse, type NextRequest } from "next/server";
import { getDownloadUrl } from "@/lib/github/api";
import { tryCreateServerSupabaseClient } from "@/lib/supabase/server";
import { tryCreateServiceSupabaseClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * 빌드 다운로드 (docs/design/github-build-integration.md §4.5).
 * RLS로 빌드가 보이면(= 프로젝트 멤버) GitHub에서 수 분짜리 서명 URL을 받아 302로 넘긴다 —
 * 파일은 우리 서버를 거치지 않고, GitHub 권한이 없는 팀원도 받을 수 있다.
 * 받을 수 없으면 /builds?download=<사유>로 돌려보내 화면에서 안내한다.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const back = (reason: string) =>
    NextResponse.redirect(new URL(`/builds?download=${reason}`, request.nextUrl.origin));

  const supabase = tryCreateServerSupabaseClient();
  if (!supabase) return back("error");

  const { data: build } = await supabase
    .from("builds")
    .select("id, project_id, repository_id, source, github_artifact_id, github_asset_id, expired_at")
    .eq("id", params.id)
    .maybeSingle();
  if (!build) return back("not_found");
  if (build.expired_at) return back("expired");

  const { data: repository } = await supabase
    .from("project_repositories")
    .select("installation_id, repo_full_name, disconnected_at")
    .eq("id", build.repository_id)
    .maybeSingle();
  if (!repository || repository.disconnected_at) return back("disconnected");

  try {
    const url = await getDownloadUrl(
      repository.installation_id,
      repository.repo_full_name,
      build.source === "artifact"
        ? { kind: "artifact", artifactId: build.github_artifact_id! }
        : { kind: "release_asset", assetId: build.github_asset_id! }
    );
    if (url) return NextResponse.redirect(url);

    // 보관 기간이 지났다 — 다음부터 버튼을 비활성으로 보이게 기록한다(클라이언트는 이 칸을 못 쓴다).
    await tryCreateServiceSupabaseClient()
      ?.from("builds")
      .update({ expired_at: new Date().toISOString() })
      .eq("id", build.id);
    return back("expired");
  } catch (error) {
    console.error("[build-download]", error);
    return back("error");
  }
}
