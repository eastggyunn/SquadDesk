"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "squaddesk-browser-notifications";

export type BrowserNotificationPermission = NotificationPermission | "unsupported";

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

/** 이 브라우저에서 OS 알림을 띄울지. 켜고 권한까지 허락돼야 실제로 띄운다. */
export function isBrowserNotificationOn(): boolean {
  return typeof Notification !== "undefined" && Notification.permission === "granted" && readEnabled();
}

/**
 * 탭이 열려 있을 때만 쓰는 OS 알림(Notification API) 켜기/끄기. 기기마다 따로 정하는 편의
 * 설정이라 localStorage에 둔다. 켤 때 권한을 묻고, 거절되면 꺼진 채로 남는다.
 */
export function useBrowserNotifications() {
  const [permission, setPermission] = useState<BrowserNotificationPermission>("default");
  const [enabled, setEnabledState] = useState(false);

  useEffect(() => {
    if (typeof Notification === "undefined") {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
    setEnabledState(isBrowserNotificationOn());
  }, []);

  const setEnabled = useCallback(async (next: boolean) => {
    if (typeof Notification === "undefined") return;
    let granted = Notification.permission === "granted";
    if (next && !granted) {
      const result = await Notification.requestPermission();
      setPermission(result);
      granted = result === "granted";
    }
    const on = next && granted;
    try {
      localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
    } catch {
      // 저장이 막힌 환경(시크릿 창 등)에서는 이번 세션에서만 유지된다.
    }
    setEnabledState(on);
  }, []);

  return { permission, enabled, setEnabled };
}
