import type { Config } from "tailwindcss";

// 컴포넌트는 zinc(중립색)/cyan(포인트색)/상태색 클래스를 쓰지만, 실제 값은 globals.css의 CSS 변수에서 온다.
// 테마(다크/라이트)는 변수만 바꾸면 되도록 팔레트를 토큰으로 매핑한다.
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

function tokenScale(name: string, shades: readonly number[] = SHADES) {
  return Object.fromEntries(shades.map((shade) => [shade, `rgb(var(--${name}-${shade}) / <alpha-value>)`]));
}

// 상태색은 글자로 쓰는 300·400 단계와 옅은 배경으로 쓰는 500 단계만 토큰으로 바꾼다 —
// 라이트 모드에서 흰 바탕에 읽히도록 글자 단계만 진해진다(globals.css). 나머지 단계는 Tailwind 기본값.
const HUE_SHADES = [300, 400, 500] as const;
const HUES = ["red", "amber", "emerald", "blue", "rose", "violet", "orange", "purple", "pink"] as const;

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        zinc: tokenScale("neutral"),
        cyan: tokenScale("accent"),
        ...Object.fromEntries(HUES.map((hue) => [hue, tokenScale(hue, HUE_SHADES)])),
      },
      // 전체적으로 한 단계 더 둥글게 — 나중에 글래스 재질을 얹어도 어색하지 않은 곡률.
      borderRadius: {
        DEFAULT: "0.375rem",
        md: "0.625rem",
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
      },
    },
  },
  plugins: [],
};

export default config;
