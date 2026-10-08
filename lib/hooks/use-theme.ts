"use client";

import { useEffect, useState } from "react";
import { THEME_STORAGE_KEY, applyTheme, type ThemePreference } from "@/lib/theme";

function readStored(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

/** 현재 테마 선택과 바꾸는 함수. 선택은 이 브라우저에 저장되어 새로고침 후에도 유지된다. */
export function useTheme() {
  // 서버 렌더에는 저장소가 없으므로 "system"으로 시작하고, 마운트 직후 저장된 값으로 맞춘다.
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    setPreference(readStored());
  }, []);

  function changeTheme(next: ThemePreference) {
    setPreference(next);
    applyTheme(next);
    try {
      if (next === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // 저장이 막힌 환경(시크릿 창 등)에서도 이번 화면에는 적용된다.
    }
  }

  return { preference, changeTheme };
}
