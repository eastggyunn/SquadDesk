import type { Bug, Task } from "./types";

/**
 * MyTasksWidget과 ProjectHealthWidget이 공유하는 "내 미완료 작업" 정의.
 * Task.assignee엔 user id가 없어 이름으로 판별한다(기존 MyTasksWidget 로직 그대로).
 */
export function isMyOpenTask(task: Task, myName: string): boolean {
  return task.assignee.name === myName && task.status !== "Done";
}

/** CriticalBugsWidget과 ProjectHealthWidget이 공유하는 "열린 치명적 버그" 정의. */
export function isOpenCriticalBug(bug: Bug): boolean {
  return (bug.severity === "Blocker" || bug.severity === "High") && bug.status !== "Resolved" && bug.status !== "Closed";
}

export interface TaskCompletion {
  done: number;
  total: number;
  percent: number;
}

/** 프로젝트 건강 요약과 (구)스프린트 요약이 같은 계산을 공유하도록 단일화한다. */
export function computeTaskCompletion(tasks: Task[]): TaskCompletion {
  const total = tasks.length;
  const done = tasks.filter((task) => task.status === "Done").length;
  return { done, total, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
}
