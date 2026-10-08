"use client";

import { useId } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/hooks/use-theme";
import type { ThemePreference } from "@/lib/theme";
import { SegmentedIndicator } from "@/components/ui/segmented-indicator";
import { segmentedGroup, segmentedItem } from "@/components/ui/button-styles";

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "시스템 설정 따르기", icon: Monitor },
  { value: "light", label: "라이트 모드", icon: Sun },
  { value: "dark", label: "다크 모드", icon: Moon },
];

/** 상단바 오른쪽의 테마 전환. 다른 토글 묶음과 같은 모양(선택 표시가 미끄러진다). */
export function ThemeToggle() {
  const { preference, changeTheme } = useTheme();
  const indicatorId = useId();

  return (
    <div role="radiogroup" aria-label="화면 테마" className={segmentedGroup}>
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const isActive = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={label}
            title={label}
            onClick={() => changeTheme(value)}
            className={`relative ${segmentedItem} border-transparent px-2 ${
              isActive ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {isActive && <SegmentedIndicator layoutId={indicatorId} />}
            <Icon className="relative h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}
