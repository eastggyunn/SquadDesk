const KNOWN_MESSAGES: Record<string, string> = {
  "Invalid login credentials": "이메일 또는 비밀번호가 올바르지 않습니다.",
  "Email not confirmed": "이메일 인증이 필요합니다. 받은 편지함에서 인증 메일을 확인해주세요.",
  "User already registered": "이미 가입된 이메일입니다.",
  "Password should be at least 6 characters": "비밀번호는 최소 6자 이상이어야 합니다.",
  "Unable to validate email address: invalid format": "올바른 이메일 형식이 아닙니다.",
  "signups not allowed for this instance": "현재 이 프로젝트는 회원가입이 허용되지 않습니다.",
};

/** Supabase Auth 에러 메시지를 화면에 그대로 노출 가능한 한국어 문장으로 바꾼다. */
export function translateAuthError(message: string): string {
  return KNOWN_MESSAGES[message] ?? `인증 중 문제가 발생했습니다. (${message})`;
}
