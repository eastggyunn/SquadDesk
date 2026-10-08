import { TASKS_STORE_KEY } from "./tasks-store";
import { BUGS_STORE_KEY } from "./bugs-store";
import { CHAT_STORE_KEY } from "./chat-store";
import { WORK_DOMAINS_STORE_KEY } from "./work-domains-store";
import { SYNCED_ASSETS_STORE_KEY } from "./synced-assets-store";
import { ACTIVE_PROJECT_STORE_KEY } from "./active-project-store";
import { SPRINTS_STORE_KEY } from "./sprints-store";

const PERSISTED_STORE_KEYS = [
  TASKS_STORE_KEY,
  BUGS_STORE_KEY,
  CHAT_STORE_KEY,
  WORK_DOMAINS_STORE_KEY,
  SYNCED_ASSETS_STORE_KEY,
  ACTIVE_PROJECT_STORE_KEY,
  SPRINTS_STORE_KEY,
];

/**
 * 로그아웃 시 Zustand persist가 localStorage에 남겨둔 목업 데이터를 지운다.
 * 같은 브라우저를 다른 계정이 이어서 쓸 때 이전 세션의 작업/버그/채팅
 * 내용이 인증되지 않은 상태에서도 남아있는 것을 막기 위함이다.
 */
export function clearPersistedStores() {
  if (typeof window === "undefined") return;
  PERSISTED_STORE_KEYS.forEach((key) => window.localStorage.removeItem(key));
}
