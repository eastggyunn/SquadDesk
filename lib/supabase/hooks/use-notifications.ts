"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppNotification } from "@/lib/types";
import type { NotificationRow } from "@/lib/supabase/schema";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import * as notificationsRepo from "@/lib/supabase/repositories/notifications";

interface UseNotificationsResult {
  notifications: AppNotification[];
  unreadCount: number;
  markRead: (ids: string[]) => void;
}

/**
 * 로그인 사용자의 알림함. 새 알림(INSERT)은 Realtime으로 받아 맨 위에 붙이고,
 * 다른 탭에서 읽음 처리한 것(UPDATE)도 따라 반영한다. Supabase 모드의 로그인 사용자 전용이다.
 */
export function useNotifications(userId: string): UseNotificationsResult {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    let ignore = false;
    const supabase = getBrowserSupabaseClient();
    notificationsRepo
      .listNotifications(supabase, userId)
      .then((rows) => {
        if (!ignore) setNotifications(rows);
      })
      .catch(() => {
        // 알림은 부가 기능이라 실패해도 화면을 막지 않는다 — 종 아이콘이 비어 보일 뿐이다.
      });

    const filter = `user_id=eq.${userId}`;
    const realtimeChannel = supabase
      .channel(`notifications-${userId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter }, (payload) => {
        notificationsRepo.enrichNotifications(supabase, [payload.new as NotificationRow]).then(([notification]) => {
          if (ignore) return;
          setNotifications((prev) =>
            prev.some((item) => item.id === notification.id) ? prev : [notification, ...prev]
          );
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter }, (payload) => {
        const row = payload.new as NotificationRow;
        setNotifications((prev) =>
          prev.map((item) => (item.id === row.id ? { ...item, isRead: row.read_at !== null } : item))
        );
      })
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(realtimeChannel);
    };
  }, [userId]);

  const markRead = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    // 낙관적으로 먼저 읽음 표시한다. 실패하면 다음 조회 때 다시 안 읽음으로 보일 뿐이다.
    setNotifications((prev) => prev.map((item) => (idSet.has(item.id) ? { ...item, isRead: true } : item)));
    notificationsRepo.markNotificationsRead(getBrowserSupabaseClient(), ids).catch(() => {});
  }, []);

  return {
    notifications,
    unreadCount: notifications.filter((item) => !item.isRead).length,
    markRead,
  };
}
