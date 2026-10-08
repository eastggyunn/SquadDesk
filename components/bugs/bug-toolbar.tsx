import { Search } from "lucide-react";
import type { BugSeverity, BugStatus } from "@/lib/types";
import { Select } from "@/components/ui/select";

export type SeverityFilter = BugSeverity | "ALL";
export type StatusFilter = BugStatus | "ALL";

const SEVERITY_OPTIONS: { value: SeverityFilter; label: string }[] = [
  { value: "ALL", label: "전체 치명도" },
  { value: "Blocker", label: "Blocker" },
  { value: "High", label: "High" },
  { value: "Medium", label: "Medium" },
  { value: "Low", label: "Low" },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "전체 상태" },
  { value: "Open", label: "Open" },
  { value: "In Progress", label: "In Progress" },
  { value: "Resolved", label: "Resolved" },
  { value: "Closed", label: "Closed" },
];

const SELECT_CLASSNAME =
  "min-w-[8.5rem] rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-cyan-500 focus:outline-none";

interface BugToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  severityFilter: SeverityFilter;
  onSeverityFilterChange: (value: SeverityFilter) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  hideResolved: boolean;
  onHideResolvedChange: (value: boolean) => void;
}

export function BugToolbar({
  search,
  onSearchChange,
  severityFilter,
  onSeverityFilterChange,
  statusFilter,
  onStatusFilterChange,
  hideResolved,
  onHideResolvedChange,
}: BugToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="제목, 발생 위치로 검색"
          className="w-full rounded-md border border-zinc-700 bg-zinc-950 py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500 focus:outline-none"
        />
      </div>

      <Select
        aria-label="치명도 필터"
        value={severityFilter}
        onChange={(next) => onSeverityFilterChange(next as SeverityFilter)}
        options={SEVERITY_OPTIONS}
        className={SELECT_CLASSNAME}
        wrapperClassName="shrink-0"
      />

      <Select
        aria-label="상태 필터"
        value={statusFilter}
        onChange={(next) => onStatusFilterChange(next as StatusFilter)}
        options={STATUS_OPTIONS}
        className={SELECT_CLASSNAME}
        wrapperClassName="shrink-0"
      />

      <label className="flex shrink-0 items-center gap-2 text-sm text-zinc-400">
        해결됨 숨기기
        <button
          type="button"
          role="switch"
          aria-checked={hideResolved}
          onClick={() => onHideResolvedChange(!hideResolved)}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
            hideResolved ? "bg-cyan-500" : "bg-zinc-700"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ease-in-out ${
              hideResolved ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </label>
    </div>
  );
}
