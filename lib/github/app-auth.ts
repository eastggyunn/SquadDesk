import "server-only";
import { createSign } from "node:crypto";

/**
 * SquadDesk Builds GitHub App 인증 (docs/design/github-build-integration.md §2).
 * - App JWT: 앱 자체로 호출(설치 정보 조회, 설치 토큰 발급)
 * - 설치 토큰: 사용자가 고른 저장소를 읽는 1시간짜리 토큰. 저장하지 않고 메모리에만 캐시한다.
 * - 사용자 OAuth 토큰: 설치 콜백에서 "이 사용자가 그 설치에 접근 가능한가"를 확인할 때만 쓰고 바로 폐기한다.
 */

export const GITHUB_API = "https://api.github.com";

export type GitHubAppEnv = {
  appId: string;
  slug: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  webhookSecret: string;
};

export function getGitHubAppEnv(): GitHubAppEnv {
  const env = {
    appId: process.env.GITHUB_APP_ID,
    slug: process.env.GITHUB_APP_SLUG,
    clientId: process.env.GITHUB_APP_CLIENT_ID,
    clientSecret: process.env.GITHUB_APP_CLIENT_SECRET,
    // Vercel/.env에 한 줄(\n 이스케이프)로 넣어도, 여러 줄 그대로 넣어도 동작하게 한다.
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
  };
  const missing = Object.entries(env).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`GitHub App 환경 변수가 설정되지 않았습니다: ${missing.join(", ")} (.env.local.example 참고)`);
  }
  return env as GitHubAppEnv;
}

export function getInstallUrl(state: string): string {
  return `https://github.com/apps/${getGitHubAppEnv().slug}/installations/new?state=${encodeURIComponent(state)}`;
}

/** GitHub 권장대로 iat는 시계 오차를 감안해 60초 앞당기고, 유효 시간은 최대치(10분)보다 짧게 잡는다. */
export function createAppJwt(): string {
  const { appId, privateKey } = getGitHubAppEnv();
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iat: now - 60, exp: now + 9 * 60, iss: appId })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey).toString("base64url");
  return `${unsigned}.${signature}`;
}

// 서버리스 인스턴스가 살아 있는 동안만 유지된다 — 만료 5분 전이면 새로 받는다.
const installationTokenCache = new Map<number, { token: string; expiresAt: number }>();
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

export async function getInstallationToken(installationId: number): Promise<string> {
  const cached = installationTokenCache.get(installationId);
  if (cached && cached.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) return cached.token;

  const response = await fetch(`${GITHUB_API}/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: githubHeaders(createAppJwt()),
    cache: "no-store",
  });
  if (!response.ok) {
    installationTokenCache.delete(installationId);
    throw new GitHubApiError(response.status, `설치 토큰 발급 실패 (installation ${installationId})`);
  }
  const body = (await response.json()) as { token: string; expires_at: string };
  installationTokenCache.set(installationId, { token: body.token, expiresAt: Date.parse(body.expires_at) });
  return body.token;
}

/** 설치 콜백의 code를 사용자 토큰으로 교환한다. 실패하면 null. */
export async function exchangeOAuthCode(code: string): Promise<string | null> {
  const { clientId, clientSecret } = getGitHubAppEnv();
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { access_token?: string };
  return body.access_token ?? null;
}

/** 이 사용자 토큰으로 볼 수 있는 앱 설치 중에 installationId가 있는지 확인한다. */
export async function userCanAccessInstallation(userToken: string, installationId: number): Promise<boolean> {
  for (let page = 1; ; page += 1) {
    const response = await fetch(`${GITHUB_API}/user/installations?per_page=100&page=${page}`, {
      headers: githubHeaders(userToken),
      cache: "no-store",
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { installations: { id: number }[] };
    if (body.installations.some((installation) => installation.id === installationId)) return true;
    if (body.installations.length < 100) return false;
  }
}

/** 검증에 쓴 사용자 토큰을 GitHub에서도 무효화한다. 실패해도 흐름은 막지 않는다(저장하지 않으므로). */
export async function revokeUserToken(userToken: string): Promise<void> {
  const { clientId, clientSecret } = getGitHubAppEnv();
  await fetch(`${GITHUB_API}/applications/${clientId}/token`, {
    method: "DELETE",
    headers: {
      ...githubHeaders(null),
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: JSON.stringify({ access_token: userToken }),
    cache: "no-store",
  }).catch(() => undefined);
}

export function githubHeaders(token: string | null): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "SquadDesk-Builds",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(`${message} — GitHub 응답 ${status}`);
  }
}
