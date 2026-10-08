"use client";

import { memo, useMemo } from "react";
import type { Task } from "@/lib/types";
import { STATUS_BAR_COLORS } from "@/lib/task-status";
import {
  HEADER_HEIGHT,
  ROW_HEIGHT,
  getBarLayout,
  getDateX,
  getPrimaryColumns,
  getSecondaryGroups,
  getTimelineWidth,
  type TimelineRange,
  type ViewMode,
} from "./gantt-utils";
import { GanttBar } from "./gantt-bar";
import { surfaceLayoutId } from "@/lib/motion";

interface GanttChartProps {
  tasks: Task[];
  viewMode: ViewMode;
  range: TimelineRange;
  onSelectTask: (task: Task) => void;
  /** 지금 서랍으로 열려 있는 작업 — 그 막대는 서랍으로 이어지고 잠시 사라진다. */
  expandedTaskId?: string;
}

function GanttChartComponent({ tasks, viewMode, range, onSelectTask, expandedTaskId }: GanttChartProps) {
  const { columnsWithOffset, secondaryGroups, totalWidth } = useMemo(() => {
    const primaryColumns = getPrimaryColumns(viewMode, range);

    let cursor = 0;
    const withOffset = primaryColumns.map((column) => {
      const left = cursor;
      cursor += column.width;
      return { ...column, left };
    });

    return {
      columnsWithOffset: withOffset,
      secondaryGroups: getSecondaryGroups(viewMode, range),
      totalWidth: getTimelineWidth(viewMode, range),
    };
  }, [viewMode, range]);

  const todayX = useMemo(() => getDateX(new Date(), viewMode, range), [viewMode, range]);

  const taskLayouts = useMemo(
    () => tasks.map((task) => ({ task, layout: getBarLayout(task, viewMode, range) })),
    [tasks, viewMode, range]
  );

  const totalHeight = tasks.length * ROW_HEIGHT;

  return (
    // overflow-clip: 열린 서랍과 이어진 막대 배경(SurfaceAnchor)이 스크롤 영역을 키우지 않게 한다.
    // hidden과 달리 clip은 스크롤 컨테이너를 만들지 않아 안쪽 sticky 헤더가 그대로 동작한다.
    <div className="relative shrink-0 overflow-clip" style={{ width: totalWidth }}>
      <div
        className="sticky top-0 z-10 flex flex-col border-b border-zinc-800/60 bg-zinc-900/95 backdrop-blur"
        style={{ height: HEADER_HEIGHT }}
      >
        {secondaryGroups && (
          <div className="flex h-6 border-b border-zinc-800/40">
            {secondaryGroups.map((group) => (
              <div
                key={group.key}
                style={{ width: group.width }}
                className="flex shrink-0 items-center justify-center border-r border-zinc-800/40 text-[11px] font-medium uppercase tracking-wide text-zinc-500"
              >
                {group.label}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-1">
          {columnsWithOffset.map((column) => (
            <div
              key={column.key}
              style={{ width: column.width }}
              className={`flex shrink-0 items-center justify-center border-r border-zinc-800/40 ${
                column.isCurrent ? "bg-cyan-500/10" : ""
              } ${
                viewMode === "week"
                  ? `text-[11px] font-medium ${column.isCurrent ? "text-cyan-400" : "text-zinc-400"}`
                  : `text-sm font-semibold ${column.isCurrent ? "text-cyan-400" : "text-zinc-200"}`
              }`}
            >
              {column.label}
            </div>
          ))}
        </div>
      </div>

      <div className="relative" style={{ height: totalHeight }}>
        {columnsWithOffset.map((column) => (
          <div
            key={column.key}
            className={`absolute inset-y-0 border-r border-zinc-800/30 ${
              column.isCurrent ? "bg-cyan-500/[0.04]" : ""
            }`}
            style={{ left: column.left, width: column.width }}
          />
        ))}

        <div className="absolute inset-y-0 z-20 w-px bg-blue-500" style={{ left: todayX }} />

        {taskLayouts.map(({ task, layout }) => (
          <div key={task.id} className="relative border-b border-zinc-800/60" style={{ height: ROW_HEIGHT }}>
            {layout && (
              <GanttBar
                layout={layout}
                colorClassName={STATUS_BAR_COLORS[task.status]}
                surfaceLayoutId={surfaceLayoutId("task", task.id)}
                isExpanded={task.id === expandedTaskId}
                onClick={() => onSelectTask(task)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export const GanttChart = memo(GanttChartComponent);
