"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Bell, CalendarClock, Settings, X } from "lucide-react";
import type { AppNotification } from "@/lib/types";
import { AnchoredPopover } from "@/components/ui/anchored-popover";
import { SegmentedIndicator } from "@/components/ui/segmented-indicator";
import { segmentedGroup, segmentedItem } from "@/components/ui/button-styles";
import { getAvatarColor } from "@/lib/avatar-color";
import { formatRelativeTime } from "@/lib/format";
import { SPRING } from "@/lib/motion";
import { describeNotification, notificationHref } from "@/lib/notifications";
import { isBrowserNotificationOn } from "@/lib/hooks/use-browser-notifications";
import { useNotifications, type NotificationFilter } from "@/lib/supabase/hooks/use-notifications";
import { NotificationSettings } from "./notification-settings";

const FILTERS: { value: NotificationFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "unread", label: "안 읽음" },
];

/** 상단바 알림 종 — Supabase 모드에서 로그인 사용자에게만 보인다(데모에는 받는 사람이 없다). */
export function NotificationBell({ userId }: { userId: string }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<"list" | "settings">("list");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const filterIndicatorId = useId();

  function openNotification(notification: AppNotification) {
    inbox.markRead([notification.id]);
    setIsOpen(false);
    const href = notificationHref(notification);
    if (!href) return;
    // href의 ?project로 ProjectFromUrl이 프로젝트를 바꾸고, 각 화면이 쿼리로 서랍/채널을 연다.
    router.push(href);
  }

  // 탭이 뒤에 있을 때만 OS 알림을 띄운다 — 앞에 있으면 종 배지로 충분하다.
  function showBrowserNotification(notification: AppNotification) {
    if (!document.hidden || !isBrowserNotificationOn()) return;
    const osNotification = new Notification(describeNotification(notification), {
      body: notification.excerpt ?? undefined,
      tag: notification.id,
    });
    osNotification.onclick = () => {
      window.focus();
      openNotification(notification);
      osNotification.close();
    };
  }

  const inbox = useNotifications(userId, showBrowserNotification);
  const { notifications, unreadCount } = inbox;
  const hasRead = notifications.some((item) => item.isRead);

  function toggleOpen() {
    setIsOpen((open) => !open);
    setView("list");
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
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
        widthClassName="w-[22rem]"
      >
        <div className="flex items-center justify-between gap-2 px-1 pb-2">
          <div className="flex items-center gap-1">
            {view === "settings" && (
              <button
                type="button"
                onClick={() => setView("list")}
                aria-label="알림 목록으로"
                className="rounded p-1 text-zinc-400 transition-[color,background-color,transform] duration-150 hover:bg-zinc-800 hover:text-zinc-100 active:scale-90"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <p className="text-sm font-semibold text-zinc-100">{view === "settings" ? "알림 설정" : "알림"}</p>
          </div>
          {view === "list" && (
            <button
              type="button"
              onClick={() => setView("settings")}
              aria-label="알림 설정"
              className="rounded p-1 text-zinc-400 transition-[color,background-color,transform] duration-150 hover:bg-zinc-800 hover:text-zinc-100 active:scale-90"
            >
              <Settings className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* 목록→설정은 오른쪽에서 들어오고, 돌아올 때는 왼쪽에서 들어온다(드릴인). */}
        <AnimatePresence mode="popLayout" initial={false}>
        {view === "settings" ? (
          <motion.div
            key="settings"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12, transition: SPRING.exit }}
            transition={SPRING.popover}
          >
            <NotificationSettings userId={userId} />
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12, transition: SPRING.exit }}
            transition={SPRING.popover}
          >
            <div className="flex items-center justify-between gap-2 px-1 pb-2">
              <div role="radiogroup" aria-label="알림 필터" className={segmentedGroup}>
                {FILTERS.map(({ value, label }) => {
                  const isActive = inbox.filter === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => inbox.setFilter(value)}
                      className={`relative ${segmentedItem} border-transparent px-2.5 text-xs ${
                        isActive ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {isActive && <SegmentedIndicator layoutId={filterIndicatorId} />}
                      <span className="relative">
                        {label}
                        {value === "unread" && unreadCount > 0 && ` ${unreadCount}`}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={inbox.markAllRead}
                    className="rounded px-1.5 py-0.5 text-xs text-cyan-400 transition-colors hover:bg-cyan-500/10"
                  >
                    모두 읽음
                  </button>
                )}
                {hasRead && (
                  <button
                    type="button"
                    onClick={inbox.removeAllRead}
                    className="rounded px-1.5 py-0.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    읽은 알림 지우기
                  </button>
                )}
              </div>
            </div>

            {notifications.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-zinc-500">
                {inbox.filter === "unread" ? "안 읽은 알림이 없습니다." : "새 알림이 없습니다."}
              </p>
            ) : (
              // 필터를 바꾸면 목록을 새로 그린다(key) — 읽는 데이터가 통째로 들고 나지 않게.
              // 같은 목록 안에서 지우거나 새로 도착한 것만 접히고 펼쳐진다.
              <ul key={inbox.filter} className="-mx-1 max-h-96 overflow-y-auto">
                <AnimatePresence initial={false}>
                {notifications.map((notification) => (
                  <motion.li
                    key={notification.id}
                    layout
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, transition: SPRING.exit }}
                    transition={{ ...SPRING.popover, layout: SPRING.collapse }}
                    className="group relative overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => openNotification(notification)}
                      className="flex w-full gap-2.5 rounded-lg py-2 pl-2 pr-8 text-left transition-colors hover:bg-zinc-800"
                    >
                      {notification.actorName ? (
                        <span
                          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${getAvatarColor(
                            notification.actorName
                          )}`}
                        >
                          {notification.actorName.slice(0, 1)}
                        </span>
                      ) : (
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
                          <CalendarClock className="h-3.5 w-3.5" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm ${notification.isRead ? "text-zinc-400" : "text-zinc-200"}`}>
                          {describeNotification(notification)}
                        </span>
                        {notification.excerpt && (
                          <span className="mt-0.5 block truncate text-xs text-zinc-500">{notification.excerpt}</span>
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
                    <button
                      type="button"
                      onClick={() => inbox.remove([notification.id])}
                      aria-label="알림 삭제"
                      className="absolute right-1.5 top-1.5 rounded p-1 text-zinc-500 opacity-0 transition-[opacity,color,background-color,transform] duration-150 hover:bg-zinc-700 hover:text-zinc-200 focus-visible:opacity-100 active:scale-90 group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </motion.li>
                ))}
                {inbox.hasMore && (
                  <motion.li key="load-more" layout transition={SPRING.collapse}>
                    <button
                      type="button"
                      onClick={inbox.loadMore}
                      disabled={inbox.isLoadingMore}
                      className="w-full rounded-lg py-2 text-center text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-60"
                    >
                      {inbox.isLoadingMore ? "불러오는 중..." : "더 보기"}
                    </button>
                  </motion.li>
                )}
                </AnimatePresence>
              </ul>
            )}
          </motion.div>
        )}
        </AnimatePresence>
      </AnchoredPopover>
    </>
  );
}
