import type { Assignee } from "./types";

export type ActivityKind = "commit" | "asset" | "bug" | "design" | "task";

export interface ActivityItem {
  id: string;
  author: Assignee;
  action: string;
  kind: ActivityKind;
  timestamp: string;
}

export const MOCK_ACTIVITY: ActivityItem[] = [
  {
    id: "act-1",
    author: { name: "정하늘", role: "Animator" },
    action: "Spine 2D 슬라임 애니메이션 업데이트 완료",
    kind: "asset",
    timestamp: "10분 전",
  },
  {
    id: "act-2",
    author: { name: "나", role: "PM" },
    action: "익스트랙션 루팅 데이터 테이블 파서 스크립트 커밋",
    kind: "commit",
    timestamp: "25분 전",
  },
  {
    id: "act-3",
    author: { name: "정하늘", role: "Animator" },
    action: "슬라임 몬스터가 벽을 뚫고 돌진하는 버그 리포트 등록",
    kind: "bug",
    timestamp: "1시간 전",
  },
  {
    id: "act-4",
    author: { name: "이서연", role: "Designer" },
    action: "로비 UI 피그마 시안 v3 업로드",
    kind: "design",
    timestamp: "2시간 전",
  },
  {
    id: "act-5",
    author: { name: "박지훈", role: "PM" },
    action: "내일 플레이 테스트 일정 공유",
    kind: "task",
    timestamp: "3시간 전",
  },
  {
    id: "act-6",
    author: { name: "최민아", role: "Sound" },
    action: "총기 반동 사운드 이펙트 믹싱 완료",
    kind: "asset",
    timestamp: "어제",
  },
];
