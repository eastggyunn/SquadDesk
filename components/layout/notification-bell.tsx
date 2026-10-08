"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bell } from "lucide-react";
import type { AppNotification } from "@/lib/types";
import { AnchoredPopover } from "@/components/ui/anchored-popover";
import { getAvatarColor } from "@/lib/avatar-color";
import { formatRelativeTime } from "@/lib/format";
import { SPRING } from "@/lib/motion";
import { useNotifications } from "@/lib/supabase/hooks/use-notifications";
import { useActiveProject } from "@/lib/supabase/use-active-project";

/** 상단바 알림 종 — Supabase 모드에서 로그인 사용자에게만 보인다(데모에는 받는 사람이 없다). */
export function NotificationBell({ userId }: { userId: string }) {
  const router = useRouter();
  const { setActiveProjectId } = useActiveProject();
  const { notifications, unreadCount, markRead } = useNotifications(userId);
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function openNotification(notification: AppNotification) {
    markRead([notification.id]);
    setIsOpen(false);
    if (!notification.taskId) return;
    // 다른 프로젝트 알림이면 그 프로젝트로 바꾼 뒤, 칸반에서 해당 작업 서랍을 연다(board.tsx의 ?task).
    setActiveProjectId(notification.projectId);
    router.push(`/kanban?task=${notification.taskId}`);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={unreadCount > 0 ? `알림 ${unreadCount}개 안 읽음` : "알림"}
        aria-expanded={isOpen}
        className="relative rounded-lg p-1.5 text-zinc-400 transition-[color,background-color,transform] duration-150 hover:bg-zinc-800 hover:text-zinc-100 active:scale-90"
      >
        <Bell className="h-[18px] w-[18px]" />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0, transition: SPRING.exit }}
              transition={SPRING.popover}
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan-500 px-1 text-[10px] font-bold text-zinc-950"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnchoredPopover
        open={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={buttonRef}
        placement="bottom"
        align="end"
        widthClassName="w-80"
      >
        <div className="flex items-center justify-between px-1 pb-2">
          <p className="text-sm font-semibold text-zinc-100">알림</p>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markRead(notifications.map((item) => item.id))}
              className="rounded px-1.5 py-0.5 text-xs text-cyan-400 transition-colors hover:bg-cyan-500/10"
            >
              모두 읽음
            </button>
          )}
        </div>
        {notifications.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-zinc-500">새 알림이 없습니다.</p>
        ) : (
          <ul className="-mx-1 max-h-96 space-y-0.5 overflow-y-auto">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <button
                  type="button"
                  onClick={() => openNotification(notification)}
                  className="flex w-full gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-zinc-800"
                >
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${getAvatarColor(
                      notification.actorName
                    )}`}
                  >
                    {notification.actorName.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-zinc-200">
                      <span className="font-medium">{notification.actorName}</span>님이{" "}
                      {notification.taskTitle ? (
                        <span className="font-medium">{notification.taskTitle}</span>
                      ) : (
                        "작업"
                      )}
                      에서 회원님을 멘션했습니다.
                    </span>
                    {notification.commentExcerpt && (
                      <span className="mt-0.5 block truncate text-xs text-zinc-500">{notification.commentExcerpt}</span>
                    )}
                    <span className="mt-0.5 block text-[11px] text-zinc-600">
                      {formatRelativeTime(notification.createdAt)}
                    </span>
                  </span>
                  {/* "모두 읽음"을 누르면 열린 목록 안에서 점들이 한꺼번에 사라지므로 짧게 줄어들며 빠진다. */}
                  <AnimatePresence initial={false}>
                    {!notification.isRead && (
                      <motion.span
                        exit={{ opacity: 0, scale: 0.5, transition: SPRING.exit }}
                        className="mt-2 h-2 w-2 shrink-0 rounded-full bg-cyan-400"
                        aria-label="안 읽음"
                      />
                    )}
                  </AnimatePresence>
                </button>
              </li>
            ))}
          </ul>
        )}
      </AnchoredPopover>
    </>
  );
}
