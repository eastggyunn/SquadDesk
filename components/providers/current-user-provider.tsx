"use client";

import { createContext, useContext } from "react";
import type { Assignee } from "@/lib/types";
import type { ProjectSummary } from "@/lib/supabase/current-user";

export interface CurrentUserContextValue {
  id: string | null;
  email: string | null;
  assignee: Assignee;
  projects: ProjectSummary[];
}

/** 인증이 없거나 Supabase가 아직 설정되지 않은 경우의 기본값 — 기존 목업 동작과 동일하다. */
const GUEST_VALUE: CurrentUserContextValue = {
  id: null,
  email: null,
  assignee: { name: "나", role: "PM" },
  projects: [],
};

const CurrentUserContext = createContext<CurrentUserContextValue>(GUEST_VALUE);

export function CurrentUserProvider({
  value,
  children,
}: {
  value: CurrentUserContextValue | null;
  children: React.ReactNode;
}) {
  return <CurrentUserContext.Provider value={value ?? GUEST_VALUE}>{children}</CurrentUserContext.Provider>;
}

/** 로그인한 사용자의 표시용 이름/역할/소속 프로젝트. 목업 화면에서 고정 문자열 "나"를 대체할 때 사용한다. */
export function useCurrentUser(): CurrentUserContextValue {
  return useContext(CurrentUserContext);
}
