import { KanbanBoard } from "@/components/kanban/board";

/** ?task=<id> — 알림에서 들어올 때 열어 둘 작업. */
export default function KanbanPage({ searchParams }: { searchParams: { task?: string } }) {
  return <KanbanBoard deepLinkTaskId={searchParams.task ?? null} />;
}
