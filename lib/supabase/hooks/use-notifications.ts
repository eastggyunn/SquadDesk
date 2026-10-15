"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppNotification } from "@/lib/types";
import type { NotificationRow } from "@/lib/supabase/schema";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import * as notificationsRepo from "@/lib/supabase/repositories/notifications";

export type NotificationFilter = "all" | "unread";

interface UseNotificationsResult {
  notifications: AppNotification[];
  unreadCount: number;
  filter: NotificationFilter;
  setFilter: (filter: NotificationFilter) => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
  markRead: (ids: string[]) => void;
  markAllRead: () => void;
  remove: (ids: string[]) => void;
  removeAllRead: () => void;
}

// "모두 읽음"은 행마다 UPDATE 이벤트를 보내므로, 개수 재조회는 이벤트 묶음 끝에 한 번만 한다.
const COUNT_REFRESH_DELAY_MS = 300;

/**
 * 로그인 사용자의 알림함. 첫 페이지를 불러오고 "더 보기"로 오래된 것을 잇는다.
 * 새 알림(INSERT)은 Realtime으로 받아 맨 위에 붙이고(onArrive로 OS 알림을 띄울 기회를 준다),
 * 다른 탭에서 읽음 처리한 것(UPDATE)도 따라 반영한다. 안 읽은 개수는 불러온 페이지와
 * 무관하게 정확해야 하므로 서버에 개수만 따로 묻는다. Supabase 모드의 로그인 사용자 전용이다.
 */
export function useNotifications(
  userId: string,
  onArrive?: (notification: AppNotification) => void
): UseNotificationsResult {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const onArriveRef = useRef(onArrive);
  onArriveRef.current = onArrive;
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const refreshUnreadCount = useCallback(() => {
    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      notificationsRepo
        .countUnreadNotifications(getBrowserSupabaseClient(), userId)
        .then(setUnreadCount)
        .catch(() => {});
    }, COUNT_REFRESH_DELAY_MS);
  }, [userId]);

  const fetchPage = useCallback(
    (before?: string) =>
      notificationsRepo
        .listNotifications(getBrowserSupabaseClient(), userId, { before, unreadOnly: filter === "unread" })
        .then((rows) => {
          setHasMore(rows.length === notificationsRepo.NOTIFICATION_PAGE_SIZE);
          return rows;
        }),
    [userId, filter]
  );

  // 첫 페이지 — 필터를 바꾸면 다시 부른다.
  useEffect(() => {
    let ignore = false;
    fetchPage()
      .then((rows) => {
        if (!ignore) setNotifications(rows);
      })
      .catch(() => {
        // 알림은 부가 기능이라 실패해도 화면을 막지 않는다 — 종 아이콘이 비어 보일 뿐이다.
      });
    return () => {
      ignore = true;
    };
  }, [fetchPage]);

  useEffect(() => {
    let ignore = false;
    const supabase = getBrowserSupabaseClient();
    refreshUnreadCount();

    const realtimeFilter = `user_id=eq.${userId}`;
    const realtimeChannel = supabase
      .channel(`notifications-${userId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: realtimeFilter }, (payload) => {
        refreshUnreadCount();
        notificationsRepo.enrichNotifications(supabase, [payload.new as NotificationRow]).then(([notification]) => {
          if (ignore) return;
          setNotifications((prev) =>
            prev.some((item) => item.id === notification.id) ? prev : [notification, ...prev]
          );
          onArriveRef.current?.(notification);
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: realtimeFilter }, (payload) => {
        const row = payload.new as NotificationRow;
        setNotifications((prev) =>
          prev.map((item) => (item.id === row.id ? { ...item, isRead: row.read_at !== null } : item))
        );
        refreshUnreadCount();
      })
      .subscribe();

    return () => {
      ignore = true;
      clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(realtimeChannel);
    };
  }, [userId, refreshUnreadCount]);

  const loadMore = useCallback(() => {
    const last = notifications[notifications.length - 1];
    if (!last || isLoadingMore) return;
    setIsLoadingMore(true);
    fetchPage(last.createdAt)
      .then((rows) => {
        setNotifications((prev) => [...prev, ...rows.filter((row) => !prev.some((item) => item.id === row.id))]);
      })
      .catch(() => {})
      .finally(() => setIsLoadingMore(false));
  }, [notifications, isLoadingMore, fetchPage]);

  /**
   * 화면에 먼저 반영하고(낙관적) 서버에 보낸다. 실패하면 다음 조회 때 서버 상태로 돌아올 뿐이다.
   * 읽음 처리는 Realtime UPDATE가 개수를 다시 세지만, 삭제는 DELETE를 구독하지 않으므로 여기서 센다.
   */
  const mutate = useCallback(
    (optimistic: (prev: AppNotification[]) => AppNotification[], request: Promise<void>) => {
      setNotifications(optimistic);
      request.catch(() => {}).finally(refreshUnreadCount);
    },
    [refreshUnreadCount]
  );

  const markRead = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      mutate(
        (prev) => prev.map((item) => (idSet.has(item.id) ? { ...item, isRead: true } : item)),
        notificationsRepo.markNotificationsRead(getBrowserSupabaseClient(), ids)
      );
    },
    [mutate]
  );

  const markAllRead = useCallback(() => {
    setUnreadCount(0);
    mutate(
      (prev) => prev.map((item) => ({ ...item, isRead: true })),
      notificationsRepo.markAllNotificationsRead(getBrowserSupabaseClient(), userId)
    );
  }, [mutate, userId]);

  const remove = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      mutate(
        (prev) => prev.filter((item) => !idSet.has(item.id)),
        notificationsRepo.deleteNotifications(getBrowserSupabaseClient(), ids)
      );
    },
    [mutate]
  );

  const removeAllRead = useCallback(() => {
    mutate(
      (prev) => prev.filter((item) => !item.isRead),
      notificationsRepo.deleteReadNotifications(getBrowserSupabaseClient(), userId)
    );
  }, [mutate, userId]);

  return {
    notifications,
    unreadCount,
    filter,
    setFilter,
    hasMore,
    isLoadingMore,
    loadMore,
    markRead,
    markAllRead,
    remove,
    removeAllRead,
  };
}
