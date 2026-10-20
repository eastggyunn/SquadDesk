import { NextResponse, type NextRequest } from "next/server";
import { exchangeOAuthCode, revokeUserToken, userCanAccessInstallation } from "@/lib/github/app-auth";
import { getInstallation } from "@/lib/github/api";
import { GITHUB_CONNECT_COOKIE, parseGitHubConnectCookie } from "@/lib/github/connect-cookie";
import { tryCreateServerSupabaseClient } from "@/lib/supabase/server";
import { tryCreateServiceSupabaseClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * GitHub App 설치(또는 설치 변경) 후 돌아오는 주소 (docs/design/github-build-integration.md §4.2).
 * 1) 쿠키의 state와 비교해 우리가 시작한 요청인지 확인
 * 2) code → 사용자 토큰 → GET /user/installations로 이 사용자가 그 설치에 실제로 접근 가능한지 확인
 *    (installation_id만 URL에 넣어 남의 저장소를 연결하는 것을 막는다). 토큰은 확인 후 폐기.
 * 3) 설치 정보와 접근 기록을 저장하고 /builds의 저장소 선택 단계로 보낸다.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const connect = parseGitHubConnectCookie(request.cookies.get(GITHUB_CONNECT_COOKIE)?.value);
  const redirectTo = (query: Record<string, string>) => {
    const url = new URL("/builds", request.nextUrl.origin);
    if (connect) url.searchParams.set("project", connect.projectId);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const response = NextResponse.redirect(url);
    response.cookies.delete({ name: GITHUB_CONNECT_COOKIE, path: "/api/github" });
    return response;
  };

  const installationId = Number(params.get("installation_id"));
  const code = params.get("code");
  if (!connect || params.get("state") !== connect.nonce || !Number.isSafeInteger(installationId) || installationId <= 0) {
    return redirectTo({ github: "state" });
  }

  const supabase = tryCreateServerSupabaseClient();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!user) {
    return NextResponse.redirect(new URL(`/login?redirectTo=${encodeURIComponent("/builds")}`, request.nextUrl.origin));
  }
  if (user.is_anonymous) return redirectTo({ github: "access" });

  const service = tryCreateServiceSupabaseClient();
  if (!service) return redirectTo({ github: "server" });

  const userToken = code ? await exchangeOAuthCode(code) : null;
  if (!userToken) return redirectTo({ github: "auth" });
  const canAccess = await userCanAccessInstallation(userToken, installationId);
  await revokeUserToken(userToken);
  if (!canAccess) return redirectTo({ github: "access" });

  try {
    const installation = await getInstallation(installationId);
    const { error: installationError } = await service.from("github_installations").upsert({
      installation_id: installation.id,
      account_login: installation.account.login,
      account_type: installation.account.type,
      suspended_at: installation.suspended_at,
    });
    if (installationError) throw installationError;

    const { error: accessError } = await service
      .from("github_installation_access")
      .upsert({ installation_id: installation.id, user_id: user.id, verified_at: new Date().toISOString() });
    if (accessError) throw accessError;
  } catch (error) {
    console.error("[github-setup]", error);
    return redirectTo({ github: "server" });
  }

  return redirectTo({ connect: String(installationId) });
}
