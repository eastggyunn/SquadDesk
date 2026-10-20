/**
 * 설치 시작(server action) → 설치 콜백(/api/github/setup) 사이에 넘기는 일회용 state.
 * "use server" 파일은 async 함수만 export할 수 있어 상수·타입을 여기 둔다.
 */
export const GITHUB_CONNECT_COOKIE = "squaddesk_github_connect";

export type GitHubConnectCookie = { nonce: string; projectId: string };

export function parseGitHubConnectCookie(raw: string | undefined): GitHubConnectCookie | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<GitHubConnectCookie>;
    return typeof value.nonce === "string" && typeof value.projectId === "string"
      ? { nonce: value.nonce, projectId: value.projectId }
      : null;
  } catch {
    return null;
  }
}

/** 설치 콜백이 /builds로 돌려보낼 때 붙이는 오류 코드 → 화면 문구. */
export const GITHUB_CONNECT_ERRORS: Record<string, string> = {
  state: "연결 요청이 만료되었거나 올바르지 않습니다. 다시 시도해주세요.",
  auth: "GitHub 계정 확인에 실패했습니다. 다시 시도해주세요.",
  access: "이 GitHub 설치에 접근할 권한이 확인되지 않았습니다.",
  server: "서버 설정 문제로 연결을 마치지 못했습니다. 관리자에게 문의해주세요.",
};
