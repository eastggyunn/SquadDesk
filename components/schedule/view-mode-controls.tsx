"use client";

import { useId } from "react";
import { LocateFixed } from "lucide-react";
import { SegmentedIndicator } from "@/components/ui/segmented-indicator";
import type { ViewMode } from "./gantt-utils";
import { segmentedGroup, segmentedItem } from "@/components/ui/button-styles";

const MODE_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "week", label: "주" },
  { value: "month", label: "개월" },
  { value: "quarter", label: "분기" },
];

interface ViewModeControlsProps {
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  onToday: () => void;
}

export function ViewModeControls({ viewMode, onChangeViewMode, onToday }: ViewModeControlsProps) {
  const indicatorId = useId();
  return (
    <div className={segmentedGroup}>
      <button
        type="button"
        onClick={onToday}
        className={`${segmentedItem} flex items-center gap-1.5 border-transparent text-cyan-400 hover:bg-zinc-800`}
      >
        <LocateFixed className="h-3.5 w-3.5" />
        오늘
      </button>
      <span className="h-4 w-px bg-zinc-800" />
      {MODE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChangeViewMode(option.value)}
          className={`relative ${segmentedItem} border-transparent ${
            viewMode === option.value ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {viewMode === option.value && <SegmentedIndicator layoutId={indicatorId} />}
          <span className="relative">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
