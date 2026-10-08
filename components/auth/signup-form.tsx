"use client";

import { useFormState } from "react-dom";
import { signup } from "@/lib/supabase/auth-actions";
import { INITIAL_AUTH_FORM_STATE } from "@/lib/supabase/auth-form-state";
import { AUTH_FIELD_CLASSNAME } from "./field-classname";
import { AuthSubmitButton } from "./auth-submit-button";
import { AuthErrorAlert } from "./auth-error-alert";

export function SignupForm({ redirectTo }: { redirectTo?: string }) {
  const [state, formAction] = useFormState(signup, INITIAL_AUTH_FORM_STATE);

  if (state.message) {
    return (
      <p className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2.5 text-sm text-cyan-300">
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}

      <div>
        <label htmlFor="name" className="text-sm font-medium text-zinc-400">
          이름 <span className="text-zinc-600">(선택)</span>
        </label>
        <input id="name" name="name" placeholder="예: 김도윤" className={AUTH_FIELD_CLASSNAME} />
      </div>

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
          autoComplete="new-password"
          placeholder="6자 이상"
          className={AUTH_FIELD_CLASSNAME}
        />
      </div>

      <AuthErrorAlert message={state.error} />

      <AuthSubmitButton label="회원가입" pendingLabel="가입 처리 중..." />
    </form>
  );
}
