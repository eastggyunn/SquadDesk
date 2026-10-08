import type { Task } from "@/lib/types";

export type ViewMode = "week" | "month" | "quarter";

export const VIEW_MODE_UNIT_WIDTH: Record<ViewMode, number> = {
  week: 36,
  month: 160,
  quarter: 220,
};

export const ROW_HEIGHT = 56;
export const HEADER_HEIGHT = 60;

export interface TimelineRange {
  start: Date;
  end: Date;
}

export function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function diffInDays(a: Date, b: Date) {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / MS_PER_DAY);
}

export function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

export function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

export function formatLongDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${year}. ${month}. ${day}`;
}

function getTaskDateBounds(tasks: Task[]) {
  let earliest: Date | undefined;
  let latest: Date | undefined;

  tasks.forEach((task) => {
    [parseDate(task.startDate), parseDate(task.dueDate)].forEach((date) => {
      if (!date) return;
      if (!earliest || date < earliest) earliest = date;
      if (!latest || date > latest) latest = date;
    });
  });

  return { earliest, latest };
}

/**
 * The timeline always spans at least 6 months on either side of today, and
 * widens further if any task falls outside that window — so today's marker
 * and every task bar are guaranteed to land somewhere on the scrollable canvas.
 */
export function getTimelineRange(tasks: Task[]): TimelineRange {
  const today = new Date();
  const { earliest, latest } = getTaskDateBounds(tasks);

  const anchorStart = earliest && earliest < today ? earliest : today;
  const anchorEnd = latest && latest > today ? latest : today;

  return {
    start: new Date(anchorStart.getFullYear(), anchorStart.getMonth() - 6, 1),
    end: new Date(anchorEnd.getFullYear(), anchorEnd.getMonth() + 7, 0),
  };
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthIndex(date: Date) {
  return date.getFullYear() * 12 + date.getMonth();
}

function quarterIndex(date: Date) {
  return date.getFullYear() * 4 + Math.floor(date.getMonth() / 3);
}

function getQuarterStart(date: Date) {
  const startMonth = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), startMonth, 1);
}

function getQuarterEnd(date: Date) {
  const start = getQuarterStart(date);
  return new Date(start.getFullYear(), start.getMonth() + 3, 0);
}

/** Pixel offset of an arbitrary date on the timeline, given the active zoom level. */
export function getDateX(date: Date, mode: ViewMode, range: TimelineRange): number {
  const unitWidth = VIEW_MODE_UNIT_WIDTH[mode];

  if (mode === "week") {
    return diffInDays(range.start, date) * unitWidth;
  }

  if (mode === "month") {
    const monthsBefore = monthIndex(date) - monthIndex(range.start);
    const daysInThisMonth = getDaysInMonth(date.getFullYear(), date.getMonth());
    const fraction = (date.getDate() - 1) / daysInThisMonth;
    return monthsBefore * unitWidth + fraction * unitWidth;
  }

  const quartersBefore = quarterIndex(date) - quarterIndex(range.start);
  const quarterStart = getQuarterStart(date);
  const quarterEnd = getQuarterEnd(date);
  const totalDays = diffInDays(quarterStart, quarterEnd) + 1;
  const dayOffset = diffInDays(quarterStart, date);
  const fraction = dayOffset / totalDays;
  return quartersBefore * unitWidth + fraction * unitWidth;
}

export function getTimelineWidth(mode: ViewMode, range: TimelineRange): number {
  const unitWidth = VIEW_MODE_UNIT_WIDTH[mode];

  if (mode === "week") {
    return (diffInDays(range.start, range.end) + 1) * unitWidth;
  }
  if (mode === "month") {
    return (monthIndex(range.end) - monthIndex(range.start) + 1) * unitWidth;
  }
  return (quarterIndex(range.end) - quarterIndex(range.start) + 1) * unitWidth;
}

export interface PrimaryColumn {
  key: string;
  label: string;
  width: number;
  isCurrent: boolean;
}

/** The main header row + grid columns: days (week), months (month), or quarters (quarter). */
export function getPrimaryColumns(mode: ViewMode, range: TimelineRange): PrimaryColumn[] {
  const unitWidth = VIEW_MODE_UNIT_WIDTH[mode];
  const today = new Date();
  const columns: PrimaryColumn[] = [];

  if (mode === "week") {
    const totalDays = diffInDays(range.start, range.end) + 1;
    for (let i = 0; i < totalDays; i++) {
      const date = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate() + i);
      columns.push({
        key: String(date.getTime()),
        label: String(date.getDate()),
        width: unitWidth,
        isCurrent: isSameDay(date, today),
      });
    }
    return columns;
  }

  if (mode === "month") {
    const startIdx = monthIndex(range.start);
    const endIdx = monthIndex(range.end);
    for (let idx = startIdx; idx <= endIdx; idx++) {
      const year = Math.floor(idx / 12);
      const month = idx % 12;
      columns.push({
        key: `${year}-${month}`,
        label: `${MONTH_NAMES[month]} ${year}`,
        width: unitWidth,
        isCurrent: year === today.getFullYear() && month === today.getMonth(),
      });
    }
    return columns;
  }

  const startIdx = quarterIndex(range.start);
  const endIdx = quarterIndex(range.end);
  for (let idx = startIdx; idx <= endIdx; idx++) {
    const year = Math.floor(idx / 4);
    const quarter = (idx % 4) + 1;
    columns.push({
      key: `${year}-Q${quarter}`,
      label: `Q${quarter} ${year}`,
      width: unitWidth,
      isCurrent: quarterIndex(today) === idx,
    });
  }
  return columns;
}

export interface SecondaryGroup {
  key: string;
  label: string;
  width: number;
}

/** Week view only: the month-spanning label row above the day numbers. */
export function getSecondaryGroups(mode: ViewMode, range: TimelineRange): SecondaryGroup[] | null {
  if (mode !== "week") return null;

  const unitWidth = VIEW_MODE_UNIT_WIDTH.week;
  const totalDays = diffInDays(range.start, range.end) + 1;
  const groups: SecondaryGroup[] = [];

  let cursor = 0;
  while (cursor < totalDays) {
    const date = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate() + cursor);
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInThisMonth = getDaysInMonth(year, month);
    const daysRemainingInMonth = daysInThisMonth - date.getDate() + 1;
    const daysInGroup = Math.min(daysRemainingInMonth, totalDays - cursor);

    groups.push({
      key: `${year}-${month}`,
      label: `${MONTH_ABBR[month]} ${year}`,
      width: daysInGroup * unitWidth,
    });

    cursor += daysInGroup;
  }

  return groups;
}

export interface BarLayout {
  left: number;
  width: number;
  title: string;
  rangeLabel: string;
}

export function getBarLayout(task: Task, mode: ViewMode, range: TimelineRange): BarLayout | null {
  const rawStart = parseDate(task.startDate);
  const rawEnd = parseDate(task.dueDate) ?? rawStart;
  if (!rawStart || !rawEnd) return null;

  const taskStart = rawStart <= rawEnd ? rawStart : rawEnd;
  const taskEnd = rawStart <= rawEnd ? rawEnd : rawStart;

  if (taskEnd < range.start || taskStart > range.end) return null;

  const visibleStart = taskStart < range.start ? range.start : taskStart;
  const visibleEnd = taskEnd > range.end ? range.end : taskEnd;
  const dayAfterEnd = new Date(visibleEnd.getFullYear(), visibleEnd.getMonth(), visibleEnd.getDate() + 1);

  const left = getDateX(visibleStart, mode, range);
  const right = getDateX(dayAfterEnd, mode, range);
  const gap = mode === "week" ? 6 : 8;

  const rangeLabel =
    task.startDate && task.dueDate
      ? `${formatLongDate(task.startDate)} ~ ${formatLongDate(task.dueDate)}`
      : formatLongDate(task.startDate ?? task.dueDate ?? "");

  return {
    left,
    width: Math.max(right - left - gap, 8),
    title: task.title,
    rangeLabel,
  };
}
