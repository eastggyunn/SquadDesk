import type { Sprint } from "./types";

/** 오늘 날짜("YYYY-MM-DD", 로컬 기준). */
export function todayString() {
  return new Date().toLocaleDateString("sv-SE");
}

/** 오늘이 기간 안에 들어가는 스프린트. 없으면 앞으로 시작할 가장 가까운 스프린트, 그것도 없으면 null. */
export function findCurrentSprint(sprints: Sprint[], today = todayString()): Sprint | null {
  const sorted = [...sprints].sort((a, b) => a.startDate.localeCompare(b.startDate));
  return (
    sorted.find((sprint) => sprint.startDate <= today && today <= sprint.endDate) ??
    sorted.find((sprint) => sprint.startDate > today) ??
    null
  );
}

function formatMonthDay(date: string) {
  const [, month, day] = date.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

/** "10월 1일 – 10월 14일" */
export function formatSprintRange(sprint: Sprint) {
  return `${formatMonthDay(sprint.startDate)} – ${formatMonthDay(sprint.endDate)}`;
}

/** 진행 중이면 남은 일수(오늘 포함), 시작 전이면 null, 끝났으면 0. */
export function daysLeftInSprint(sprint: Sprint, today = todayString()) {
  if (today < sprint.startDate) return null;
  if (today > sprint.endDate) return 0;
  const ms = new Date(sprint.endDate).getTime() - new Date(today).getTime();
  return Math.round(ms / 86_400_000) + 1;
}
