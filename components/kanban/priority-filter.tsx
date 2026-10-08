"use client";

import { useId } from "react";
import type { TaskPriority } from "@/lib/types";
import { SegmentedIndicator } from "@/components/ui/segmented-indicator";
import { segmentedGroup, segmentedItem } from "@/components/ui/button-styles";

type FilterValue = TaskPriority | "ALL";

const FILTERS: Array<{ value: FilterValue; label: string }> = [
  { value: "ALL", label: "전체보기" },
  { value: "High", label: "High" },
  { value: "Medium", label: "Medium" },
  { value: "Low", label: "Low" },
];

interface PriorityFilterProps {
  value: FilterValue;
  onChange: (value: FilterValue) => void;
}

export function PriorityFilter({ value, onChange }: PriorityFilterProps) {
  const indicatorId = useId();
  return (
    <div className={segmentedGroup}>
      {FILTERS.map((filter) => (
        <button
          key={filter.value}
          type="button"
          onClick={() => onChange(filter.value)}
          className={`relative ${segmentedItem} border-transparent ${
            value === filter.value ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {value === filter.value && <SegmentedIndicator layoutId={indicatorId} />}
          <span className="relative">{filter.label}</span>
        </button>
      ))}
    </div>
  );
}
