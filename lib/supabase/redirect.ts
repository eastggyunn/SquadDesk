/** "/"로 시작하고 "//"(프로토콜 상대 경로)가 아닌 값만 안전한 내부 리다이렉트 경로로 인정한다. */
export function sanitizeRedirectPath(value: string | null | undefined): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/";
}

/**
 * 로그인 <-> 회원가입 상호 링크가 현재의 redirectTo를 이어받게 한다.
 * 초대 링크로 들어온 사용자가 두 화면을 오가도 원래 초대 화면으로 돌아온다.
 */
export function withRedirectTo(path: string, redirectTo: string | null | undefined): string {
  return redirectTo ? `${path}?redirectTo=${encodeURIComponent(redirectTo)}` : path;
}
