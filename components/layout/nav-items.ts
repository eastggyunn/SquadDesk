import { LayoutDashboard, FolderTree, KanbanSquare, CalendarDays, Bug, MessageSquare, Users } from "lucide-react";

// 사이드바 메뉴와 상단바 경로 표시가 같은 목록을 쓴다.
export const NAV_ITEMS = [
  { href: "/", label: "대시보드", icon: LayoutDashboard },
  { href: "/domains", label: "업무 영역", icon: FolderTree },
  { href: "/kanban", label: "칸반 보드", icon: KanbanSquare },
  { href: "/schedule", label: "일정 관리", icon: CalendarDays },
  { href: "/bugs", label: "버그 리포트", icon: Bug },
  { href: "/chat", label: "팀 채팅", icon: MessageSquare },
  { href: "/members", label: "팀 멤버", icon: Users },
] as const;

export function isNavItemActive(href: string, pathname: string | null) {
  return pathname === href || Boolean(pathname?.startsWith(`${href}/`));
}
