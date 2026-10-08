"use client";

import { useFormState } from "react-dom";
import { login } from "@/lib/supabase/auth-actions";
import { INITIAL_AUTH_FORM_STATE } from "@/lib/supabase/auth-form-state";
import { AUTH_FIELD_CLASSNAME } from "./field-classname";
import { AuthSubmitButton } from "./auth-submit-button";
import { AuthErrorAlert } from "./auth-error-alert";

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [state, formAction] = useFormState(login, INITIAL_AUTH_FORM_STATE);

  return (
    <form action={formAction} className="space-y-4">
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}

      <div>
        <label htmlFor="email" className="text-sm font-medium text-zinc-400">
          이메일
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className={AUTH_FIELD_CLASSNAME}
        />
      </div>

      <div>
        <label htmlFor="password" className="text-sm font-medium text-zinc-400">
          비밀번호
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className={AUTH_FIELD_CLASSNAME}
        />
      </div>

      <AuthErrorAlert message={state.error} />

      <AuthSubmitButton label="로그인" pendingLabel="로그인 중..." />
    </form>
  );
}
