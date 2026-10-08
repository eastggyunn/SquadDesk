// 테마 선택 — "system"이면 OS 설정을 따르고(html에 data-theme 없음), 아니면 html[data-theme]로 고정한다.
// 실제 색은 globals.css의 토큰이 data-theme / prefers-color-scheme에 따라 바꾼다.

export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "squaddesk-theme";

export function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  if (preference === "system") delete root.dataset.theme;
  else root.dataset.theme = preference;
}

/**
 * 첫 화면을 그리기 전에 <head>에서 실행하는 스크립트. 저장된 선택을 미리 적용해,
 * 라이트를 고른 사용자가 새로고침할 때 다크 화면이 잠깐 번쩍이지 않게 한다.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}})();`;
