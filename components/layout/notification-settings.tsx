"use client";

import { useEffect, useState } from "react";
import type { NotificationKind } from "@/lib/types";
import { NOTIFICATION_KINDS, NOTIFICATION_KIND_LABELS } from "@/lib/notifications";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import * as notificationsRepo from "@/lib/supabase/repositories/notifications";
import type { NotificationPreferences } from "@/lib/supabase/repositories/notifications";
import { useBrowserNotifications } from "@/lib/hooks/use-browser-notifications";
import { Switch } from "@/components/ui/switch";

function toggleKind(list: NotificationKind[], kind: NotificationKind, muted: boolean): NotificationKind[] {
  return muted ? Array.from(new Set([...list, kind])) : list.filter((item) => item !== kind);
}

/** 종 아이콘 팝오버 안의 설정 화면 — 종류별 앱 알림/메일 요약, 이 브라우저의 OS 알림. */
export function NotificationSettings({ userId }: { userId: string }) {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const browser = useBrowserNotifications();

  useEffect(() => {
    let ignore = false;
    notificationsRepo
      .getNotificationPreferences(getBrowserSupabaseClient(), userId)
      .then((value) => {
        if (!ignore) setPreferences(value);
      })
      .catch(() => {
        if (!ignore) setError("설정을 불러오지 못했습니다.");
      });
    return () => {
      ignore = true;
    };
  }, [userId]);

  function update(next: NotificationPreferences) {
    const previous = preferences;
    setPreferences(next);
    setError(null);
    notificationsRepo.saveNotificationPreferences(getBrowserSupabaseClient(), userId, next).catch(() => {
      setPreferences(previous);
      setError("설정을 저장하지 못했습니다.");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-lg bg-zinc-800/40 px-2.5 py-2">
        <span className="min-w-0">
          <span className="block text-sm text-zinc-200">브라우저 알림</span>
          <span className="block text-[11px] text-zinc-500">
            {browser.permission === "unsupported"
              ? "이 브라우저는 지원하지 않습니다."
              : browser.permission === "denied"
                ? "브라우저 설정에서 알림이 차단되어 있습니다."
                : "탭이 열려 있으면 다른 창을 보고 있어도 알려줍니다."}
          </span>
        </span>
        <Switch
          size="sm"
          label="브라우저 알림"
          checked={browser.enabled}
          disabled={browser.permission === "unsupported" || browser.permission === "denied"}
          onChange={browser.setEnabled}
        />
      </div>

      <div>
        <div className="flex items-center justify-end gap-3 px-2.5 pb-1 text-[11px] text-zinc-500">
          <span className="w-9 text-center">앱</span>
          <span className="w-9 text-center">메일</span>
        </div>
        {preferences === null ? (
          <p className="px-2.5 py-4 text-center text-xs text-zinc-500">{error ?? "불러오는 중..."}</p>
        ) : (
          <ul className="space-y-0.5">
            {NOTIFICATION_KINDS.map((kind) => {
              const appOn = !preferences.mutedKinds.includes(kind);
              const emailOn = appOn && !preferences.emailMutedKinds.includes(kind);
              const label = NOTIFICATION_KIND_LABELS[kind];
              return (
                <li key={kind} className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5">
                  <span className="min-w-0 truncate text-sm text-zinc-300">{label}</span>
                  <span className="flex shrink-0 items-center gap-3">
                    <Switch
                      size="sm"
                      label={`${label} 앱 알림`}
                      checked={appOn}
                      onChange={(on) => update({ ...preferences, mutedKinds: toggleKind(preferences.mutedKinds, kind, !on) })}
                    />
                    <Switch
                      size="sm"
                      label={`${label} 메일 요약`}
                      checked={emailOn}
                      disabled={!appOn}
                      onChange={(on) =>
                        update({ ...preferences, emailMutedKinds: toggleKind(preferences.emailMutedKinds, kind, !on) })
                      }
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {preferences !== null && error && <p className="px-2.5 pt-1 text-xs text-red-400">{error}</p>}
      </div>

      <p className="px-2.5 text-[11px] leading-relaxed text-zinc-500">
        메일은 매일 오전 9시에 그때까지 읽지 않은 알림을 모아 한 통으로 보냅니다. 앱 알림을 끈 종류는 메일에도 실리지 않습니다.
      </p>
    </div>
  );
}
