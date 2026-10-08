import type { ChatMessage } from "./types";

export const MOCK_MESSAGES: ChatMessage[] = [
  {
    id: "msg-1",
    author: { name: "김도윤", role: "Programmer" },
    content: "이번에 엑셀로 뽑은 아이템 드랍률 파서(Parser) 유니티에 적용해 봤어?",
    timestamp: "오후 1:58",
  },
  {
    id: "msg-2",
    author: { name: "나", role: "PM" },
    content: "어 방금 머지했어. ScriptableObject로 자동 변환되게 해놨어!",
    timestamp: "오후 2:01",
  },
  {
    id: "msg-3",
    author: { name: "정하늘", role: "Animator" },
    content: "스파인 2D 슬라임 애니메이션 파일 업데이트했으니 확인 부탁해!",
    timestamp: "오후 2:05",
  },
  {
    id: "msg-4",
    author: { name: "나", role: "PM" },
    content: "오 좋다, 바로 임포트해볼게 🙌",
    timestamp: "오후 2:06",
  },
  {
    id: "msg-5",
    author: { name: "박지훈", role: "PM" },
    content: "내일 오후 2시에 빌드 뽑아서 같이 플레이 테스트 해보자",
    timestamp: "오후 2:12",
  },
  {
    id: "msg-6",
    author: { name: "최민아", role: "Sound" },
    content: "오케이! 그때 총기 반동 사운드도 새 버전으로 들어갈 예정이야",
    timestamp: "오후 2:13",
  },
  {
    id: "msg-7",
    author: { name: "이서연", role: "Designer" },
    content: "로비 UI 피그마 최신 시안 링크 채널에 올려둘게",
    timestamp: "오후 2:20",
  },
  {
    id: "msg-8",
    author: { name: "오세훈", role: "QA" },
    content: "어제 리포트한 Blocker 버그 두 개는 아직 재현 중이에요, 오늘 중으로 업데이트 드릴게요",
    timestamp: "오후 2:34",
  },
  {
    id: "msg-9",
    author: { name: "나", role: "PM" },
    content: "고마워요! 특히 루팅 아이템 증발 버그는 우선순위로 봐주세요",
    timestamp: "오후 2:35",
  },
  {
    id: "msg-10",
    author: { name: "김도윤", role: "Programmer" },
    content: "그 버그는 지금 보고 있어요, PlayerLootController 쪽인 것 같아요",
    timestamp: "오후 2:36",
  },
];
