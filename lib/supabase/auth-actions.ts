"use server";

import { redirect } from "next/navigation";
import { tryCreateServerSupabaseClient } from "./server";
import { translateAuthError } from "./auth-errors";
import { sanitizeRedirectPath } from "./redirect";
import type { AuthFormState } from "./auth-form-state";

const SUPABASE_NOT_CONFIGURED_ERROR: AuthFormState = {
  error: "Supabase 설정 오류가 발생했습니다. 관리자에게 문의해주세요.",
  message: null,
};

function readCredentials(formData: FormData): { email: string; password: string } | null {
  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    return null;
  }
  return { email: email.trim(), password };
}

export async function login(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const credentials = readCredentials(formData);
  if (!credentials) {
    return { error: "이메일과 비밀번호를 입력해주세요.", message: null };
  }

  const supabase = tryCreateServerSupabaseClient();
  if (!supabase) return SUPABASE_NOT_CONFIGURED_ERROR;

  const { error } = await supabase.auth.signInWithPassword(credentials);
  if (error) {
    return { error: translateAuthError(error.message), message: null };
  }

  const redirectTo = formData.get("redirectTo");
  redirect(sanitizeRedirectPath(typeof redirectTo === "string" ? redirectTo : null));
}

export async function signup(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const credentials = readCredentials(formData);
  if (!credentials) {
    return { error: "이메일과 비밀번호를 입력해주세요.", message: null };
  }
  if (credentials.password.length < 6) {
    return { error: "비밀번호는 최소 6자 이상이어야 합니다.", message: null };
  }

  const name = formData.get("name");

  const supabase = tryCreateServerSupabaseClient();
  if (!supabase) return SUPABASE_NOT_CONFIGURED_ERROR;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // 초대 링크로 들어온 가입은 인증 메일을 거쳐도 원래 초대 화면으로 돌아와야 하므로,
  // redirectTo를 콜백 URL의 쿼리로 실어 보낸다(/auth/callback이 이어서 처리한다).
  const redirectToRaw = formData.get("redirectTo");
  const redirectTo = sanitizeRedirectPath(typeof redirectToRaw === "string" ? redirectToRaw : null);
  const callbackUrl = new URL("/auth/callback", siteUrl);
  if (redirectTo !== "/") callbackUrl.searchParams.set("redirectTo", redirectTo);

  const { data, error } = await supabase.auth.signUp({
    email: credentials.email,
    password: credentials.password,
    options: {
      data: typeof name === "string" && name.trim() ? { name: name.trim() } : undefined,
      emailRedirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    return { error: translateAuthError(error.message), message: null };
  }

  // 프로젝트의 Auth 설정에서 이메일 확인이 켜져 있으면 세션 없이 user만 돌아온다 —
  // 이 경우 앱으로 바로 들여보내지 않고 이메일 확인 안내를 보여준다.
  if (!data.session) {
    return { error: null, message: "가입 확인 메일을 보냈습니다. 받은 편지함에서 인증 링크를 확인해주세요." };
  }

  redirect(redirectTo);
}

export async function logout(): Promise<void> {
  const supabase = tryCreateServerSupabaseClient();
  if (!supabase) {
    redirect("/login");
  }

  await supabase.auth.signOut();
  redirect("/login");
}
