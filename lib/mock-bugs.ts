import type { Bug } from "./types";

export const MOCK_BUGS: Bug[] = [
  {
    id: "bug-1",
    title: "사망 시 루팅한 아이템이 증발하지 않는 버그",
    severity: "Blocker",
    location: "인게임 맵 - 사망 처리",
    reproductionSteps:
      "1. 인게임 맵에서 다른 파밍 플레이어를 사살한다\n2. 사망한 플레이어의 인벤토리에서 아이템을 루팅한다\n3. 루팅 직후 자신도 사망하도록 유도한다\n4. 사망 연출이 끝난 뒤 결과 화면을 확인한다",
    consoleLog:
      "NullReferenceException: Object reference not set to an instance of an object\n  at PlayerLootController.DropItemsOnDeath () (at Assets/Scripts/Player/PlayerLootController.cs:142)\n  at PlayerHealth.Die () (at Assets/Scripts/Player/PlayerHealth.cs:88)\n  at UnityEngine.Debug:LogException(Exception)",
    reporter: { name: "오세훈", role: "QA" },
    status: "Open",
    createdAt: "2026-10-04",
  },
  {
    id: "bug-2",
    title: "매칭 후 로딩 화면에서 5% 확률로 무한 로딩",
    severity: "Blocker",
    location: "로비 - 매칭 시스템",
    reproductionSteps:
      "1. 3인 스쿼드로 매칭을 시도한다\n2. 매칭 성사 직후 로딩 화면에 진입한다\n3. 세션 토큰 발급이 지연되면 무한 로딩이 발생한다 (재현율 약 5%)",
    consoleLog:
      "[Matchmaking] Timeout waiting for session token (attempt 3/3)\nSystem.TimeoutException: The operation has timed out.\n  at Matchmaking.SessionClient.ConnectAsync (System.Threading.CancellationToken cancellationToken)\n  at Matchmaking.MatchmakingManager+<StartMatch>d__12.MoveNext ()",
    reporter: { name: "김도윤", role: "Programmer" },
    status: "In Progress",
    createdAt: "2026-10-03",
    taskId: "task-10",
  },
  {
    id: "bug-3",
    title: "슬라임 몬스터가 돌진(Rush) 상태일 때 벽을 뚫고 나가는 현상",
    severity: "High",
    location: "인게임 맵 - 지하 수로 구역",
    reproductionSteps:
      "1. 지하 수로 구역에서 슬라임 몬스터를 어그로한다\n2. 좁은 통로의 벽 근처로 유인한다\n3. Rush 패턴이 발동하는 순간 벽 방향으로 이동하도록 유도한다\n4. 슬라임이 콜라이더를 무시하고 벽 밖으로 이탈하는지 확인한다",
    reporter: { name: "정하늘", role: "Animator" },
    status: "Open",
    createdAt: "2026-10-02",
    taskId: "task-1",
  },
  {
    id: "bug-4",
    title: "샷건 산탄 히트박스가 벽 뒤 몬스터에도 적용됨",
    severity: "High",
    location: "인게임 맵 - 전투 밸런스",
    reproductionSteps:
      "1. 샷건을 장착한 상태로 얇은 벽 오브젝트 근처로 이동한다\n2. 벽 뒤에 몬스터가 위치하도록 유도한다\n3. 벽을 향해 샷건을 발사한다\n4. 벽 뒤 몬스터의 피격 여부를 확인한다",
    consoleLog:
      "[Combat] Warning: Raycast hit registered through BlockingCollider2D (layer: Environment) at (12.4, 0.0, -3.1)",
    reporter: { name: "박지훈", role: "Programmer" },
    status: "Open",
    createdAt: "2026-10-01",
    taskId: "task-6",
  },
  {
    id: "bug-5",
    title: "결과 화면에서 획득 골드 표시가 실제 지급량과 다름",
    severity: "Medium",
    location: "결과 화면 (Extraction Summary)",
    reproductionSteps:
      "1. 인게임에서 골드를 파밍한 뒤 추출 지점으로 이동한다\n2. 정상적으로 추출을 완료한다\n3. 결과 화면에 표시되는 골드 수치를 확인한다\n4. 로비 UI 기준 실제 보유 골드와 비교한다",
    reporter: { name: "이서연", role: "Designer" },
    status: "Open",
    createdAt: "2026-09-30",
  },
  {
    id: "bug-6",
    title: "인벤토리 UI 새로고침 시 장착 무기 아이콘 깜빡임",
    severity: "Low",
    location: "인벤토리",
    reproductionSteps:
      "1. 인벤토리 창을 연다\n2. 장착 중인 무기를 다른 슬롯으로 드래그했다가 되돌린다\n3. 아이콘이 잠깐 사라졌다 다시 나타나는 깜빡임 현상을 확인한다",
    reporter: { name: "최민아", role: "Sound" },
    status: "Open",
    createdAt: "2026-09-29",
    taskId: "task-3",
  },
  {
    id: "bug-7",
    title: "옵션 메뉴에서 마우스 감도 슬라이더가 저장되지 않음",
    severity: "Low",
    location: "설정 메뉴",
    reproductionSteps:
      "1. 설정 메뉴에서 마우스 감도를 변경한다\n2. 게임을 재시작한다\n3. 설정 메뉴에 재진입하여 감도 값이 유지되는지 확인한다",
    consoleLog:
      "PlayerPrefs.GetFloat: 'MouseSensitivity' key not found, returning default 1.0",
    reporter: { name: "오세훈", role: "QA" },
    status: "Resolved",
    createdAt: "2026-09-28",
  },
];
