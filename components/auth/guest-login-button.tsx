"use client";

import { useFormState } from "react-dom";
import { loginAsGuest } from "@/lib/supabase/auth-actions";
import { INITIAL_AUTH_FORM_STATE } from "@/lib/supabase/auth-form-state";
import { AuthSubmitButton } from "./auth-submit-button";
import { AuthErrorAlert } from "./auth-error-alert";

/** 가입 없이 샘플 프로젝트로 둘러보는 게스트 로그인. 게스트마다 별도 샌드박스가 만들어진다. */
export function GuestLoginButton() {
  const [state, formAction] = useFormState(loginAsGuest, INITIAL_AUTH_FORM_STATE);

  return (
    <form action={formAction} className="space-y-3">
      <AuthErrorAlert message={state.error} />
      <AuthSubmitButton label="게스트로 둘러보기" pendingLabel="체험 공간 준비 중..." variant="secondary" />
      <p className="text-center text-xs text-zinc-500">가입 없이 샘플 프로젝트로 모든 기능을 써볼 수 있어요.</p>
    </form>
  );
}
