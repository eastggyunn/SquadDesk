# SquadDesk

익스트랙션 슈터 게임 개발팀을 위한 사내 협업 도구. 작업(칸반/일정), 버그 리포트, 팀 채팅, 통합 에셋 현황을 한 화면에서 관리한다.

## 현재 구현 범위

- **프론트엔드 화면**: Next.js(App Router) + Zustand.
- **데이터 계층(1단계)**: `supabase/migrations/`에 다중 사용자 협업 서비스를 전제로 한 Postgres 스키마(프로젝트/팀, 업무 영역, 작업, 버그, 채팅 채널·메시지, 첨부파일 메타데이터, 통합 에셋)를 정의하고, `lib/supabase/`에 그 스키마를 프론트엔드 타입으로 변환하는 mapper를 준비했다.
- **인증 및 프로젝트 접근 권한(2단계)**: Supabase Auth(이메일/비밀번호)로 로그인/회원가입/로그아웃을 구현하고, `middleware.ts`가 모든 요청에서 세션을 검사해 미인증 사용자는 앱 화면에, 인증된 사용자는 `/login`·`/signup`에 접근하지 못하게 막는다. 프로젝트 단위 접근 제어(owner/member)는 RLS로 보장된다.
- **칸반·버그 실데이터 전환(3-A)**: Supabase 환경 변수가 설정된 경우, 칸반 보드와 버그 리포트가 사이드바에서 고른 활성 프로젝트의 실제 Supabase 데이터로 동작한다(조회/생성/수정/삭제/상태 이동).
- **일정·업무 영역·대시보드 실데이터 전환(3-B)**: Supabase 환경 변수가 설정된 경우, 일정(Gantt) 화면·업무 영역 화면·대시보드가 활성 프로젝트의 실제 Supabase 작업·버그·업무 영역 데이터로 동작한다(대시보드의 정보 구조는 11단계에서 다시 정리했다). 업무 영역은 추가/삭제/드래그 순서 변경이 Supabase에 반영되며, 삭제해도 소속 작업은 삭제되지 않고 미분류로 남는다(DB의 `on delete set null`). 칸반/일정/업무 영역 세 화면의 작업 생성·수정·삭제 폼 제출 로직은 `lib/hooks/use-task-form-actions.ts`로 공유한다.
- **팀 채팅 실데이터·실시간 전환(4단계)**: Supabase 환경 변수가 설정된 경우, 팀 채팅이 활성 프로젝트의 실제 Supabase 채널·메시지 데이터로 동작한다. 채널 목록 조회/생성/이름 변경이 Supabase에 반영되고, 채널 삭제는 메시지 이력을 보존하기 위해 물리 삭제 대신 보관(`archived_at`) 처리한다(`supabase/migrations/00000000000010_chat_archive_and_realtime.sql`). 같은 프로젝트 내 활성 채널 이름 중복은 부분 유니크 인덱스로 막는다. 현재 열린 채널의 새 메시지는 Supabase Realtime(`postgres_changes` INSERT 구독)으로 실시간 반영되며, 내가 보낸 메시지는 전송 응답으로 먼저 반영해 realtime 에코가 와도 중복 표시되지 않는다. 실시간 구독 오류 시 한국어 안내와 재시도 버튼을 보여준다. 이모지·멘션은 입력 편의 기능만 유지한다.
- **채팅 메시지 파일 첨부 실업로드 전환(7단계, 이번 작업)**: Supabase 모드에서 채팅의 파일 첨부 버튼이 실제 업로드로 동작한다. 5-A단계에서 만든 `attachments` 버킷·Storage RLS·확장자/20MB 검증(`lib/supabase/repositories/attachments.ts`)을 그대로 재사용하며, 메시지는 먼저 저장하고(텍스트 없이 파일만 있어도 전송 가능) 그 메시지 id를 `target_id`·`target_type = 'chat_message'`로 삼아 첨부를 업로드한다. 파일별로 독립적으로 업로드하므로 일부가 실패해도 메시지와 다른 첨부는 그대로 남고, 실패한 파일만 메시지에 딸린 "재시도" 버튼으로 다시 올릴 수 있다(업로드 실패가 메시지 전송 실패처럼 보이지 않는다). 업로드 중/실패는 한국어로 표시된다. 첨부 메타데이터의 실시간 반영을 위해 `attachments` 테이블을 `supabase_realtime` publication에 추가했다(`supabase/migrations/00000000000013_chat_attachment_realtime.sql`) — 메시지가 먼저 도착하고 첨부가 나중에 저장돼도, 다른 사용자 화면에서 해당 메시지에 첨부가 이어 붙는다. 메시지·첨부 실시간 이벤트는 각각 별도의 id 집합으로 중복 반영을 막는다. 외부 링크 첨부는 이번 단계 범위 밖이다(이미지 미리보기는 12단계, 이미 전송된 메시지의 첨부 삭제는 13단계에서 각각 추가됐다 — 아래 참고).
- **작업·버그 첨부파일 실 업로드 전환(5-A단계)**: Supabase 환경 변수가 설정된 경우, 칸반/일정/업무 영역의 작업 폼과 버그 폼에서 파일 선택·드래그 앤 드롭으로 첨부한 파일이 private Storage 버킷 `attachments`(`supabase/migrations/00000000000011_attachment_storage.sql`)에 실제로 업로드된다. Storage 오브젝트 경로는 `{project_id}/{attachment_id}/{파일명}`으로, 프로젝트 멤버만 자기 프로젝트 폴더를 조회/업로드/삭제할 수 있도록 Storage RLS로 제한한다(service role key·public 버킷·공개 URL 없음). 다운로드는 60초 제한 signed URL로만 가능하다. 업로드 성공 후 `attachments` 메타데이터 저장이 실패하면 방금 올린 Storage 파일을 자동으로 지워 고아 파일을 남기지 않는다(`lib/supabase/repositories/attachments.ts`의 `uploadAttachment`). 허용 확장자·최대 20MB 제한을 벗어나면 한국어 오류를 즉시 보여주고, 저장 중/실패/재시도 가능 상태를 폼 안에서 한국어로 표시한다. 작업/버그를 삭제하면 연결된 첨부의 Storage 객체와 메타데이터가 함께 정리된다. 외부 링크(Figma 등) 첨부는 기존처럼 실 파일 업로드와 구분해 별도로 저장된다. Supabase 모드에서 활성 프로젝트가 없으면 첨부 영역 자체가 "활성 프로젝트가 없어 첨부파일을 업로드할 수 없습니다" 안내로 대체된다.
- **팀 멤버 초대·권한 관리(6단계)**: owner가 UI(`/members`)에서 팀원을 초대·관리할 수 있어, 더 이상 SQL Editor로 멤버십을 직접 INSERT하지 않아도 된다. 이메일로 초대를 만들면 owner가 직접 전달하는 **초대 링크**(`/invite/<token>`)가 생성되고, 링크를 받은 사람이 **그 이메일 계정으로 로그인한 경우에만** 수락된다. 이메일 발송·Admin API·service_role key는 쓰지 않는다. 토큰은 256비트 난수이며 DB에는 sha256 해시만 저장되므로 원문은 생성 직후 1회만 노출된다(잃어버리면 취소 후 재발급). 초대에는 만료 시각과 `pending`/`accepted`/`revoked` 상태, 생성자·수락자 이력이 남고 owner는 미수락 초대를 취소할 수 있다. 수락은 SECURITY DEFINER 함수 안에서 행 잠금(`for update`)과 함께 처리되어 멤버십 생성과 상태 전이가 원자적이고, 이미 수락·취소·만료된 초대는 재사용되지 않는다. 역할 변경·멤버 제거는 owner만 가능하며(기존 `project_members` RLS), **마지막 owner의 강등·제거는 DB 트리거가 항상 막는다** — UI의 비활성화는 보조 수단일 뿐이다(`supabase/migrations/00000000000012_project_invitations_and_member_management.sql`).
- **대시보드 통합 에셋 실데이터·직접 업로드 전환(8단계)**: Supabase 환경 변수가 설정된 경우, 대시보드의 "최신 통합 에셋" 위젯이 활성 프로젝트의 실제 `asset_categories`/`asset_syncs` 데이터로 동작한다. 카테고리 추가·삭제와 최신 파일명 변경이 Supabase에 반영되고, 다운로드는 기존 signed URL 방식을 그대로 쓴다. 작업 폼에서 첨부에 "대시보드 통합 파일로 갱신" 토글을 켜면 파일을 다시 업로드하지 않고 이미 저장된 첨부 메타데이터를 가리키는 `asset_syncs` 이력만 추가한다 — 이 폼 세션에서 방금 추가한 첨부도 토글할 수 있으며, 실제 동기화 저장은 작업 저장(첨부 업로드 포함)이 끝난 뒤에 실행돼 아직 존재하지 않는 첨부를 가리키는 이력이 만들어지지 않는다. 대시보드에서 파일을 직접 올리면 기존 `uploadAttachment`로 Storage+`attachments`에 실제 저장한 뒤 그 카테고리의 최신 동기화 이력으로 추가하며, 이 동기화 저장이 실패하면 방금 올린 Storage 파일을 자동으로 정리한다(고아 파일 방지). 두 출처는 화면에 이미 있던 `sourceLabel`("대시보드에서 직접 업로드" vs 작업 제목)로 구분해 표시한다. 이를 위해 `attachments.target_type`에 `'asset_category'`를 추가했다(`supabase/migrations/00000000000014_dashboard_asset_uploads.sql`) — Storage RLS는 오브젝트 경로의 project_id만 보므로 이미 새 값을 지원하고, `asset_syncs.category_id`는 이미 `on delete cascade`라 카테고리를 삭제하면 동기화 이력은 자동 정리되지만 그 이력이 가리키던 작업/버그/채팅 원본 첨부는 손대지 않는다 — **카테고리 전용으로 직접 업로드한 첨부만** Storage 객체·메타데이터를 먼저 지우고, "attachments 행 삭제 + 카테고리 행 삭제"는 `remove_asset_category` RPC 한 트랜잭션으로 묶어 원자적으로 처리한다(`supabase/migrations/00000000000015_remove_asset_category_rpc.sql`) — 앱에서 두 번의 개별 delete로 나누면 중간에 실패했을 때 애매한 상태가 남을 수 있어서다. 삭제 전에는 확인 모달을 보여준다. Supabase 모드에서는 목업 카테고리(Zustand/localStorage)가 섞이지 않는다.
- **프로젝트 생성·이름 변경 UI(9단계)**: 로그인한 사용자가 사이드바 "프로젝트" 영역의 **+ 버튼**으로 열리는 **이름 입력 모달**에서 첫 프로젝트를 직접 만들 수 있다 — 더 이상 SQL Editor로 부트스트랩할 필요가 없다. 생성은 `create_project(p_name)` RPC 하나가 처리하며, 이 스키마에서 "팀"은 별도 테이블이 아니라 `projects` + `project_members`이므로 **프로젝트 행과 생성자의 owner 멤버십이 같은 트랜잭션에서 만들어진다** — 중간에 실패하면 전부 롤백되어 프로젝트만 남는 부분 생성 상태가 생기지 않는다. 만든 사람은 자동으로 owner가 되고, 새 프로젝트가 즉시 활성 프로젝트로 선택된다(서버 목록이 따라오기 전까지는 `pendingProject`가 그 목록 위에 덮여, 선택이 첫 프로젝트로 되돌아가거나 이름이 잠깐 옛 값으로 남는 것을 막는다 — `lib/store/active-project-store.ts`, `lib/supabase/use-active-project.ts`). owner는 같은 영역의 **연필 버튼**으로 같은 모달을 열어 이름을 바꿀 수 있고(`rename_project` RPC), member에게는 그 버튼이 아예 보이지 않는다. 입력 폼을 사이드바 인라인이 아니라 모달(`components/layout/project-form-modal.tsx`)로 둔 이유는 사이드바 폭에 오류 문구가 갇히지 않게 하고, 접힌 사이드바에서도 같은 흐름을 쓰기 위해서다 — 모달은 `document.body`로 포털된다(사이드바의 `backdrop-blur`가 `position: fixed`의 기준을 사이드바로 바꾸기 때문). 이름 변경은 `projects.name`만 건드리므로 멤버십·초대 링크·첨부·작업/버그/채팅 데이터는 그대로 유지된다. **이름 중복 정책은 "호출자가 속한 프로젝트들 사이에서 중복 금지"**다 — 전역 유니크는 다른 팀이 쓴 이름을 막고 남의 프로젝트 존재를 흘리므로 쓰지 않았고, 사용자가 실제로 혼동하는 범위(사이드바 목록 = `project_members` 기준)와 DB 트리거 `enforce_project_name_unique_for_actor()`의 판정 범위를 정확히 일치시켰다. 이름 길이(1~50자)는 `projects_name_length` CHECK 제약과 UI 검증이 같은 값을 쓰고, 정규화 규칙(앞뒤 공백 제거·연속 공백 1칸·소문자)도 SQL `normalize_project_name()`과 `lib/supabase/repositories/projects.ts`가 동일하다. 두 RPC 모두 `authenticated`에게만 실행 권한을 주고 `anon`에서는 회수했으며, owner 검증은 UI가 아니라 RPC와 기존 `projects_update_owner` RLS가 강제한다(service role key·클라이언트 RLS 우회 없음). 프로젝트 영구 삭제는 이번 단계 범위 밖이다(보관·복원은 10단계에서 추가됐다 — "프로젝트 보관·복원" 참고).
- **프로젝트 보관·복원(10단계, 이번 작업)**: 끝난 프로젝트를 **지우지 않고** 목록에서 치운다. 영구 삭제는 이번에도 구현하지 않는다 — 보관은 `projects.archived_at` 한 컬럼을 세우는 것이 전부이고 행 삭제도 cascade도 없어 멤버십·초대·작업·버그·채팅·첨부 메타데이터·Storage 파일이 전부 그대로 남는다(채널 보관과 같은 어휘를 쓴다). owner에게만 사이드바 "프로젝트" 영역의 **보관 아이콘**이 보이고, 누르면 **확인 모달**을 거쳐야 실행된다(`archive_project` RPC). 보관된 프로젝트는 활성 선택 목록에서 빠져 그 아래 **"보관됨 N" 접이식 목록**으로만 보이며, 그 프로젝트의 owner에게만 **복원 버튼**이 붙는다(`restore_project` RPC). member는 목록만 읽고 보관·복원할 수 없다. 지금 보고 있던 프로젝트를 보관하면 **다른 활성 프로젝트로 곧바로 넘어가고**, 활성 프로젝트가 하나도 남지 않으면 기존 `NoProjectBanner` 흐름을 그대로 쓴다(이 경우 배너가 복원 경로를 함께 안내한다). localStorage에 남은 선택 값이 보관된 프로젝트를 가리키면 첫 활성 프로젝트로 되돌린 뒤 그 값을 다시 저장해 잘못된 값이 남지 않는다(`lib/supabase/use-active-project.ts`). **보관된 프로젝트는 읽기 전용이다** — 목록에서 감추는 것만으로는 UI를 우회한 쓰기를 막지 못하고, 특히 삭제가 열려 있으면 "보존" 약속이 깨지기 때문에, 읽기 정책은 그대로 두고 쓰기 정책만 새 헬퍼 `is_project_writable()`(멤버 + 미보관)로 좁혔다(작업·버그·업무 영역·채널·메시지·첨부·에셋 카테고리/동기화 + Storage 업로드/삭제). 이름 중복 판정은 **활성 프로젝트끼리만** 하므로 보관한 이름을 다시 쓸 수 있고, 복원 시 같은 이름의 활성 프로젝트가 있으면 `restore_project()`가 한국어 예외로 거부한다. 별도 `teams` 테이블은 만들지 않았다 — 이 스키마에서 팀은 계속 `projects` + `project_members`다. **영구 삭제 경로는 아예 닫았다**: `projects`의 DELETE 정책을 제거해 클라이언트가 테이블을 직접 지워 cascade로 데이터를 날리는 길을 막았고, UPDATE는 활성 프로젝트의 owner에게만 열어 두었다(보관/복원은 SECURITY DEFINER RPC 전용). 보관 중에는 멤버 추가·역할 변경·제거와 초대 생성·취소·수락도 모두 막히며, 초대 수락은 `archived` 상태 코드로 안내한다(`00000000000018_archive_readonly_hardening.sql`).

- **대시보드 정보 구조 개선 및 실데이터 전환(11단계, 이번 작업)**: 목업을 실데이터로 바꾸는 것을 넘어 대시보드의 우선순위와 중복을 정리했다. **상단**엔 "프로젝트 건강 요약" 카드 하나만 둔다 — 예전에 따로 있던 "알파 빌드 진행도"(하드코딩된 62%, 이미 지난 목표일인데도 항상 `D-0`으로 보이던 카드)와 "스프린트 요약"의 상단 진행률(같은 숫자를 다시 보여주던 중복)을 이 카드 하나로 합쳤다. **전체 작업 완료율**(활성 프로젝트 작업의 done/total), **열린 Blocker·High 버그 수**, **내 미완료 작업 수** 세 지표 모두 실제 작업/버그 데이터로 계산하며, 값이 0이면 그대로 0을 보여준다(가짜 숫자 없음). 목표일 필드는 `projects` 스키마에 없으므로 새 컬럼을 만들지 않고 "목표일 정보 없음"을 고정 표시한다("전체 마일스톤 진행률"이라는 표현도 실제 마일스톤 데이터가 없어 "전체 작업 진행률"로 바꿨다). `SUB_SPRINTS`의 68%/54%/40% 같은 하드코딩된 하위 진행률은 실제 데이터로 계산할 근거가 없어 카드째 정리했다(스프린트 요약 위젯 폐지). **중단**은 내 작업 · 치명적 버그 · 최근 활동 3열 그리드다 — 최근 활동을 화면 맨 아래에서 이 위치로 끌어올렸다. **최근 활동은 Supabase 모드에서 `MOCK_ACTIVITY`를 쓰지 않는다** — 활성 프로젝트의 작업·버그·에셋 동기화·채팅 메시지 4개 소스에서 `created_at`/`reporter_id`/`sender_id`/`uploaded_by`(모두 기존 컬럼)를 모아 최신순 8개로 합친다(`lib/supabase/repositories/dashboard.ts`). 별도 감사 로그 테이블이나 트리거는 새로 만들지 않았다. **이 피드는 "완전한 수정 이력"이 아니라 각 테이블의 `created_at` 기준 최근 등록·동기화·메시지다** — 작업의 상태 변경이나 담당자 재배정, 버그의 상태 전환 같은 "이후 수정"은 반영되지 않는다(예: 오래전에 만든 작업의 상태를 방금 바꿔도 피드에는 나타나지 않는다). 나중에 수정 이력까지 포함한 진짜 감사 로그가 필요해지면 `updated_at`만으로는 "무엇이 바뀌었는지"를 알 수 없으므로 별도 이벤트/로그 테이블 설계가 필요하다 — 이번 단계 범위 밖이다. **하단**엔 최신 통합 에셋을 그대로 두되(업로드·이름 변경·삭제 기능 그대로), 기본으로는 최근에 갱신된 카테고리 4개만 보이고 "전체 보기" 토글로 나머지를 펼친다 — 화면을 많이 차지하지 않으면서 관리 기능은 전혀 줄이지 않았다. **중복 요청 제거**: 예전엔 스프린트 요약·내 작업·치명적 버그 위젯이 각자 `useSupabaseTasks`/`useSupabaseBugs`를 호출해 같은 작업/버그 목록을 최대 3번 중복 조회했다. 새 읽기 전용 훅 `useDashboardData`(`lib/supabase/hooks/use-dashboard-data.ts`)가 `dashboardRepo.loadDashboardSnapshot()` 한 번만 호출해 작업·버그·최근 활동을 함께 가져오고, 대시보드 위젯들이 그 결과를 나눠 쓴다 — 칸반/버그 화면이 쓰는 CRUD 훅(`useSupabaseTasks`/`useSupabaseBugs`)은 전혀 건드리지 않았다. `loadDashboardSnapshot()` 내부에서도 `tasks`/`bugs` 테이블은 각각 정확히 한 번만 조회한다 — 그 raw row를 `tasks.ts`/`bugs.ts`에서 export한 `enrichTasks`/`enrichBugs`로 위젯용 `Task[]`/`Bug[]`를 만드는 데도 쓰고, 그중 최신 N개를 추려 최근 활동 항목을 만드는 데도 그대로 재사용한다(활동 피드용으로 tasks/bugs를 또 조회하지 않는다). 채팅·에셋 동기화만 대시보드 전용으로 별도 조회하며, 전부 `limit` 또는 `.in()` 배치라 N+1이 없다. 로컬 데모 모드는 지금까지처럼 `MOCK_ACTIVITY`를 그대로 쓴다. **프로젝트 전환 race condition 방지**: 프로젝트를 빠르게 연속 전환하면 먼저 보낸 요청이 나중에 도착할 수 있다(A → B로 바꿨는데 A의 응답이 B보다 늦게 옴). `useDashboardData`는 매 `refetch()` 호출마다 세대 카운터(`generation` ref)를 가장 먼저 올리고, 응답이 왔을 때 그 카운터가 여전히 자신의 세대와 같을 때만 `setTasks`/`setBugs`/`setActivity`/`setError`/`setIsLoading(false)`를 반영한다 — 늦게 도착한 이전 프로젝트 응답은 조용히 버려진다. 활성 프로젝트가 없어지는 경우(`projectId === null`)도 같은 카운터를 먼저 올린 뒤 배열을 비우고 로딩을 종료하므로, 그 직후 이전 프로젝트의 늦은 응답이 방금 비운 상태를 다시 채우지 않는다. 활성 프로젝트가 없으면 AppLayout의 `NoProjectBanner`가 이미 안내하므로, 대시보드는 위젯마다 같은 "소속된 프로젝트가 없습니다" 문구를 반복하지 않고 아예 렌더링하지 않는다. 보관된 프로젝트는 읽기만 가능하므로(`is_project_writable()`, 10-a단계) 대시보드 조회는 그대로 동작하며, 이번 단계에서 새 쓰기 기능은 추가하지 않았다. 새 마이그레이션은 없다 — 기존 테이블의 컬럼만으로 전부 계산·조회했다.

- **첨부파일 UX 개선 — 이미지 미리보기·통합 에셋 버전 이력/비교(12단계, 이번 작업)**: 작업·버그·채팅 첨부와 대시보드 통합 에셋 네 곳이 공용 `AttachmentPreviewModal`(`components/ui/attachment-preview-modal.tsx`)을 공유한다. `kind === "image"`이거나 실제 이미지 확장자(`isImageAttachment`, `components/kanban/attachment-icon.tsx`)인 첨부에만 미리보기 버튼이 붙고, 누르면 기존 다운로드와 같은 방식(60~120초 제한 signed URL, `createAttachmentPreviewUrl`)으로 이미지를 불러온다 — public URL이나 영구 링크는 만들지 않으며, signed URL은 모달이 열려 있는 동안 컴포넌트 상태로만 존재하고 localStorage나 DB에는 저장하지 않는다. 외부 링크 첨부(Figma 등)는 그대로 새 탭 링크로 열리고 이미지로 간주하지 않는다. 로컬 데모 모드에서는 미리보기 버튼 자체를 보여주지 않는다(실제 파일이 없는 목업 첨부를 억지로 미리보기하지 않기 위해서 — 기존 목업 다운로드만 유지). 모달은 `document.body`로 포털되고 Esc·바깥 클릭(패널 전체 클릭 시 닫히고, 다이얼로그 박스 클릭은 `stopPropagation`으로 막아 안쪽 클릭으론 안 닫힌다)·닫기 버튼을 지원하며, 이미지는 `object-contain`으로 모달 밖을 넘지 않는다. 통합 에셋 카드에는 "버전 이력" 버튼이 생겨 기존 `asset_syncs`(카테고리별 첨부 이력)를 재사용해 카테고리 전체 동기화 이력을 최신순으로 보여준다 — 대시보드 진입 시 자동 조회하지 않고 이력을 열 때만 지연 조회한다(`useAssetVersionHistory`). 조회는 항상 2개 쿼리다: `asset_syncs`를 `category_id`로 + 그 행들이 가리키는 `attachments`를 `.in()` 배치 조회 — 버전이 몇 개든 N+1이 없다. 가리키던 첨부가 삭제된 이력은 "파일을 찾을 수 없음"으로만 표시하고 나머지 이력·화면은 그대로 정상 동작한다. 이력에서 이미지 버전 두 개를 고르면(같은 카테고리 안에서만, 이미지가 아닌 버전은 선택 대상에서 빠진다) `AssetVersionCompareModal`이 좌우로 나란히 보여준다 — 각 쪽 위에 파일명·source label·등록 시각을 표시하고, 한쪽이 signed URL 생성에 실패해도 그쪽만 오류가 뜨고 다른 쪽은 그대로 보인다. 서버에서 이미지를 합성하거나 차이를 계산하지 않으며 다운로드나 원본 데이터 변경도 없다 — 단순 좌우 비교만 한다. 기존 첨부 업로드·삭제·다운로드와 통합 에셋의 업로드·이름 변경·삭제 기능은 그대로 유지된다. 새 마이그레이션은 없다 — 기존 `attachments`/`asset_syncs`/private Storage 버킷과 RLS를 그대로 쓴다.

- **채팅 메시지 첨부파일 삭제(13단계, 이번 작업)**: 이미 전송된 채팅 메시지의 첨부파일을 개별로 삭제할 수 있다 — 메시지 본문과 다른 첨부는 그대로 남는다. 삭제 전 기존 `DeleteConfirmModal`을 재사용해 확인을 받고, 삭제 중/실패/재시도 상태를 첨부 칩에 한국어로 표시한다(`components/chat/message-row.tsx`). 권한 경계는 UI가 아니라 DB다 — `attachments`/`storage.objects`의 삭제 RLS 정책이 "채팅 첨부(target_type=chat_message)는 그 메시지의 발신자만" 조건을 추가로 확인하고(작업·버그·에셋 첨부의 기존 삭제 권한은 그대로 둔다), 다른 프로젝트·보관된 프로젝트의 첨부는 기존 `is_project_writable()`이 이미 차단한다(`00000000000019_chat_attachment_delete_hardening.sql`). 클라이언트는 실제 삭제 전에 `assert_can_delete_chat_attachment` RPC로 구체적인 한국어 실패 사유(작성자 아님/보관됨/멤버 아님)를 먼저 받는다. Storage 우선 삭제 → 메타데이터 삭제 순서는 작업/버그 첨부 삭제(`deleteAttachmentRow`)와 동일하게 재사용하며, 이미 삭제된 첨부를 재시도하면 성공으로 수렴한다. 다른 브라우저 세션에는 `attachments` 테이블의 Realtime DELETE 구독으로 즉시 반영된다(REPLICA IDENTITY FULL로 old 레코드에 project_id를 포함시켜야 Realtime의 select 정책 평가가 통과한다). **14단계**에서 이 경계를 한 단계 더 다졌다: `attachments` 테이블의 UPDATE 권한을 컬럼 단위로 `original_filename` 하나에만 열어(`revoke`/`grant update`, 대시보드 최신 파일명 변경만 이 경로를 쓴다) `project_id`/`target_type`/`target_id`/`storage_path`/`uploaded_by`/업로드 시점 파일 속성이 삽입 이후 절대 바뀌지 않게 했다 — 이로써 `target_id`를 바꿔치기해 발신자 판정을 우회하는 실제 권한 경계 문제가 막혔다. 그리고 `assert_can_delete_chat_attachment` RPC가 검증한 `storage_path`를 직접 반환하도록 바꿔, 클라이언트가 브라우저 state에 들고 있던(오래됐거나 잘못됐을 수 있는) 경로 대신 항상 id와 짝지어진 값만 쓰게 했다 — Storage RLS가 어차피 경로를 다시 독립 검증하므로 이것이 새 권한을 여는 구멍을 막는 것은 아니지만, "내 첨부를 지우려다 같은 프로젝트의 다른 첨부를 대신 지워 그 DB 행이 고아로 남는" 데이터 무결성 사고를 막는다(`00000000000020_attachment_integrity_hardening.sql`).

- Supabase가 설정되지 않았거나(로컬 데모) 활성 프로젝트가 없으면, 위 모든 화면이 그에 맞는 기존 목업 동작 또는 빈 상태 안내로 자동 전환된다. 프로젝트 영구 삭제 UI, 조직 단위 관리는 여전히 다음 단계 과제다.

## 로컬 환경 설정

```bash
npm install
cp .env.local.example .env.local   # 아래 "환경 변수" 참고
npm run dev
```

## 환경 변수

`.env.local.example`을 복사해 `.env.local`을 만들고 값을 채운다. 실제 키/URL/계정 정보는 절대 커밋하지 않는다.

| 변수 | 설명 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon(public) API 키. **service_role 키는 절대 여기 넣지 않는다** — 브라우저에 노출되는 `NEXT_PUBLIC_*` 변수는 공개돼도 안전한 키만 허용한다. |
| `NEXT_PUBLIC_SITE_URL` | 회원가입 확인 메일의 리디렉션 기준 URL(`/auth/callback`로 이어짐). 로컬은 `http://localhost:3000`. |

Supabase 환경 변수가 비어 있으면 `middleware.ts`의 인증 게이트가 자동으로 통과 모드로 동작한다 — Supabase 없이도 UI를 목업 데이터로 확인할 수 있게 하기 위한 의도적 동작이다. **인증을 실제로 검증하려면 반드시 위 변수를 채워야 한다.**

## 마이그레이션

`supabase/migrations/`의 파일은 반드시 파일명 순서(타임스탬프 오름차순)대로 적용한다. Supabase CLI를 쓴다면:

```bash
supabase db push
```

| 파일 | 내용 |
| --- | --- |
| `00000000000001_init_schema.sql` | 초기 스키마: users, tasks, bugs, chats |
| `00000000000002_projects_and_teams.sql` | 프로젝트/팀 소속(project_members), RLS용 멤버십 헬퍼 함수 |
| `00000000000003_work_domains.sql` | 업무 영역(프로젝트별 정렬 순서 포함) |
| `00000000000004_align_task_and_bug_terminology.sql` | 프론트엔드 타입과 용어 통일(버그 심각도 Blocker, bugs.location 등), tasks.priority/start_date/domain_id 추가 |
| `00000000000005_chat_channels_and_messages.sql` | 채팅 채널 도입, 기존 chats → chat_messages로 재구성 |
| `00000000000006_attachments_and_synced_assets.sql` | 첨부파일 메타데이터, 통합 에셋 카테고리/동기화 이력 |
| `00000000000007_users_soft_delete.sql` | 사용자 비활성화(소프트 삭제)로 이력 보존 |
| `00000000000008_row_level_security.sql` | 전 테이블 RLS 활성화 및 "인증된 팀 사용자" 최소 정책 |
| `00000000000009_handle_new_auth_user.sql` | 회원가입 시 `public.users` 프로필 자동 생성 트리거 |
| `00000000000010_chat_archive_and_realtime.sql` | 채팅 채널 보관(`archived_at`, 활성 채널만 이름 유니크) + `chat_messages`를 `supabase_realtime` publication에 등록 |
| `00000000000011_attachment_storage.sql` | private Storage 버킷 `attachments` 생성(20MB 제한) + 프로젝트 멤버만 자기 프로젝트 경로에 조회/업로드/삭제 가능한 Storage RLS |
| `00000000000012_project_invitations_and_member_management.sql` | `project_invitations` 테이블(토큰 sha256 해시·만료·상태 이력) + 초대 생성/취소/조회/수락 RPC, 마지막 owner 보호 트리거, owner 전용 초대 SELECT 정책 |
| `00000000000013_chat_attachment_realtime.sql` | `attachments` 테이블을 `supabase_realtime` publication에 등록(채팅 첨부 메타데이터의 실시간 반영용) |
| `00000000000014_dashboard_asset_uploads.sql` | `attachment_target_type`에 `'asset_category'` 추가(대시보드 직접 업로드용) — Storage RLS·asset_syncs cascade는 기존 그대로 재사용 |
| `00000000000015_remove_asset_category_rpc.sql` | `remove_asset_category(p_category_id)` RPC — 카테고리 전용 첨부 메타데이터 삭제 + 카테고리 삭제를 한 트랜잭션으로 묶어 원자성 보장(SECURITY INVOKER, 기존 RLS 그대로 적용) |
| `00000000000016_project_creation_and_rename.sql` | `create_project(p_name)` / `rename_project(p_project_id, p_name)` RPC — 프로젝트+owner 멤버십 원자적 생성, owner 전용 이름 변경. 이름 길이 CHECK 제약과 "내가 속한 프로젝트들 사이의 이름 중복" 금지 트리거 포함 |
| `00000000000017_project_archive_and_restore.sql` | `projects.archived_at` + `archive_project` / `restore_project` RPC(owner 전용) — 보관은 행 삭제·cascade 없이 상태만 바꾼다. 쓰기 정책을 `is_project_writable()`(멤버 + 미보관)로 좁혀 보관 프로젝트를 읽기 전용으로 만들고, 이름 중복 판정을 활성 프로젝트로 한정 |
| `00000000000018_archive_readonly_hardening.sql` | 보관 하드닝 — `projects` DELETE 정책 제거(영구 삭제 불가), UPDATE는 활성 프로젝트 owner만, `project_members` 쓰기와 초대 생성·취소·수락을 활성 프로젝트로 제한(`is_project_active()`), `restore_project()` 이름 검사 직렬화 |
| `00000000000019_chat_attachment_delete_hardening.sql` | 채팅 첨부 삭제(13단계) — `attachments`/`storage.objects` 삭제 RLS에 "채팅 첨부는 발신자만" 조건 추가(`is_chat_attachment_deletable()` 공유 함수), `attachments`를 `REPLICA IDENTITY FULL`로 전환(Realtime DELETE 반영용), 삭제 전 한국어 실패 사유 RPC `assert_can_delete_chat_attachment` 추가 |
| `00000000000020_attachment_integrity_hardening.sql` | 첨부 구조적 무결성 강화(14단계) — `attachments` UPDATE 권한을 `original_filename` 컬럼 하나로 좁힘(컬럼 단위 GRANT/REVOKE, `project_id`/`target_type`/`target_id`/`storage_path` 등은 삽입 후 불변), `assert_can_delete_chat_attachment`가 검증된 `storage_path`를 반환하도록 재정의(브라우저가 전달한 경로를 신뢰하지 않음) |

원격 Supabase 프로젝트 생성이나 실제 적용은 이 저장소 작업 범위에 포함되어 있지 않다 — 마이그레이션 파일만 준비된 상태다.

### 프로젝트 보관 기능에 필요한 적용 순서

보관·복원은 **16 → 17 → 18**을 순서대로 적용해야 완전해진다. 중간까지만 적용한 상태는 앱이 조용히 정상인 척하지 않고 아래처럼 드러난다.

| 적용 상태 | 증상 |
| --- | --- |
| 17 미적용 | `projects` 응답에 `archived_at`이 없다. 앱은 이 경우를 **전부 활성 프로젝트**로 읽어 9단계까지의 동작(생성·이름 변경·전환)은 그대로 되지만, 보관 아이콘을 누르면 `archive_project` 함수를 찾지 못해 PostgREST 오류(`PGRST202 / Could not find the function`)가 사이드바에 그대로 표시된다. "보관됨" 목록도 영원히 나타나지 않는다. |
| 17만 적용(18 미적용) | 보관·복원과 업무 데이터 읽기 전용화는 동작하지만, **영구 삭제와 멤버·초대 경로가 열려 있다** — 클라이언트가 `projects`를 직접 DELETE하면 프로젝트와 cascade 데이터가 사라지고, 보관된 프로젝트에서도 멤버 추가·제거와 초대 생성·수락이 된다. 18을 반드시 함께 적용한다. |
| 16~18 적용 | 정상. 아래 "프로젝트 보관·복원 확인 항목"의 모든 검증이 통과해야 한다. |

`archived_at`을 읽는 코드는 `isProjectArchived()`(`lib/supabase/mappers.ts`) 한 곳을 거친다 — 값이 실제로 있을 때만 보관으로 읽어, 컬럼이 없어 `undefined`가 오는 DB를 "모든 프로젝트가 보관됨"으로 뒤집지 않기 위해서다. 서버 레이아웃(`current-user.ts`)과 클라이언트 훅(`use-project-mutations.ts`)이 같은 함수를 쓴다.

## 원격 Supabase 연결 프리플라이트 (15단계)

이 저장소는 아직 **원격 Supabase 프로젝트에 연결돼 있지 않다**. 이 절은 실제로 연결·적용하기 전에 준비 상태를 스스로 점검하는 체크리스트다 — 값을 임의로 만들어 채우거나 `.env.local`을 자동 생성하지 않으며, 원격 DB에 대한 `supabase db push`나 데이터 변경은 사람이 직접 승인한 뒤에만 실행한다.

**이 작업 환경에서 읽기 전용으로 확인한 현재 상태** (마지막 확인: 15단계 작업 시점)

- [x] Supabase CLI: **설치되어 있지 않다**(`supabase --version` 실행 시 command not found). 연결하려면 먼저 [Supabase CLI 설치 가이드](https://supabase.com/docs/guides/cli)를 따라 설치한다.
- [x] 프로젝트 링크 상태: **미연결**(`supabase/config.toml`이 없다 — `supabase link --project-ref <ref>`를 실행한 적이 없다는 뜻이다).
- [x] 마이그레이션 파일: `00000000000001_init_schema.sql`부터 `00000000000020_attachment_integrity_hardening.sql`까지 **20개 전부 파일명 순서대로 존재**하고 결측이 없다(위 "마이그레이션" 표 참고).
- [x] `package.json` / `package-lock.json`: 이름(`squad-desk`)과 버전(`0.1.0`)이 **일치**한다(14단계에서 `package-lock.json`의 stale한 `extraction-ops` 이름을 정정했다).
- [x] `.env.local`: **없다**. 아래 "환경 변수" 절의 3개 변수(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`)가 비어 있으면 실제 Supabase 연결·인증 검증은 수행할 수 없다 — 이 상태에서는 앱이 로컬 데모(목업) 모드로만 동작한다.

**원격에 실제로 연결·적용하려면 사람이 준비해야 하는 것**

1. Supabase CLI 설치 + `supabase login`.
2. 대상 Supabase 프로젝트 준비(신규 생성 또는 기존 프로젝트) 후 `supabase link --project-ref <ref>`로 이 저장소를 연결.
3. `cp .env.local.example .env.local` 후 프로젝트 설정 > API에서 URL·anon key를 채우고, `NEXT_PUBLIC_SITE_URL`을 실제 접속 도메인(로컬은 `http://localhost:3000`)으로 맞춘다.
4. 아래 "Supabase Auth 설정" 절의 세 가지(Email 프로바이더, Confirm email, Site URL/Redirect URLs)를 대시보드에서 직접 설정한다 — 마이그레이션이 대신 해주지 않는다.
5. **Storage 버킷과 Realtime publication은 마이그레이션이 전부 자동으로 만든다** — 사람이 대시보드에서 따로 만들 필요가 없다.
   - private 버킷 `attachments`(공개 아님, 20MB 제한)와 그 RLS 정책은 `00000000000011_attachment_storage.sql`이 만들고, `00000000000017`/`00000000000019`/`00000000000020`이 보관·채팅 삭제 규칙에 맞춰 갱신한다.
   - `chat_messages`/`attachments` 테이블의 Realtime 반영은 `00000000000010`/`00000000000013`이 `supabase_realtime` publication에 테이블을 추가하고, `00000000000019`가 `attachments`를 `REPLICA IDENTITY FULL`로 바꿔 DELETE 이벤트도 select 정책 평가를 통과하게 한다.
   - 적용 후에는 Supabase 대시보드의 **Storage**(버킷 `attachments`가 보이는지)와 **Database > Replication**(두 테이블이 `supabase_realtime`에 포함돼 있는지)에서 눈으로 한 번 확인하는 것을 권장한다.
6. migration 1~20을 **반드시 파일명 순서대로** 적용한다. `supabase db push`는 기본적으로 아직 적용되지 않은 파일을 오름차순으로 순서대로 적용하므로 이 요건은 CLI가 지켜준다. 특히 16→17→18, 19→20은 중간 상태로 오래 두지 않는 것을 권장한다(위 "프로젝트 보관 기능에 필요한 적용 순서" 표의 "미적용 시 증상" 참고 — 같은 원리로 19만 있고 20이 없으면 채팅 첨부 삭제는 되지만 `attachments`의 `target_type`/`storage_path` 등이 여전히 임의로 UPDATE될 수 있다).

**적용 중 오류가 나면**: 다음 마이그레이션을 강행하지 말고 그 시점에서 멈춘다. `supabase db push`는 실패한 파일 이후를 적용하지 않으므로 자연히 멈추지만, SQL Editor에서 파일을 하나씩 손으로 실행하는 경우에는 실패한 파일의 오류 메시지를 먼저 해결한 뒤 그 파일부터 다시 실행한다.

**적용 후 19·20 검증(읽기 전용 SQL, 사람이 직접 실행)**

```sql
-- 함수 존재 확인
select proname from pg_proc where proname in (
  'is_chat_attachment_deletable', 'can_delete_attachment_object',
  'assert_can_delete_chat_attachment'
);

-- attachments RLS 정책 확인
select policyname, cmd from pg_policies where tablename = 'attachments';

-- storage.objects 정책 확인
select policyname, cmd from pg_policies where tablename = 'objects' and schemaname = 'storage';

-- attachments가 REPLICA IDENTITY FULL인지 확인 (relreplident = 'f')
select relreplident from pg_class where relname = 'attachments';

-- Realtime publication에 포함돼 있는지 확인
select tablename from pg_publication_tables where pubname = 'supabase_realtime';

-- attachments UPDATE 컬럼 권한이 original_filename만 열려 있는지 확인
select grantee, column_name, privilege_type
from information_schema.column_privileges
where table_name = 'attachments' and privilege_type = 'UPDATE';
```

이 조회들은 전부 읽기 전용(SELECT)이며 실제 데이터는 건드리지 않는다.

## Supabase Auth 설정 (사람이 대시보드에서 직접 할 일)

1. **Authentication > Providers**에서 Email 프로바이더를 켠다.
2. **Authentication > Providers > Email**에서 "Confirm email"을 켤지 끌지 정한다.
   - 켜두면(기본값) 회원가입 후 이메일 인증 전까지 세션이 생기지 않는다 — `/signup`은 "가입 확인 메일을 보냈습니다" 안내만 보여주고 로그인시키지 않는다.
   - 로컬 개발 중 이메일 발송 없이 바로 테스트하려면 꺼도 된다. 이 저장소의 코드는 실제 이메일을 발송하지 않으며, 이 설정을 바꾸는 것도 이 작업 범위 밖이다.
3. **Authentication > URL Configuration**에서 Site URL과 Redirect URLs에 로컬/배포 도메인을 등록한다(예: `http://localhost:3000`, `http://localhost:3000/auth/callback`). 등록하지 않으면 이메일 인증 링크가 리디렉션을 거부한다.

## 프로젝트 접근 권한 모델

- 팀/프로젝트 경계는 `projects` + `project_members`(역할: `owner` | `member`)로 표현한다. 모든 업무 데이터(work_domains, tasks, bugs, chat, attachments, asset_categories)는 RLS로 "같은 프로젝트 멤버만 읽고 쓸 수 있음"이 보장된다 (`supabase/migrations/00000000000008_row_level_security.sql`).
- `owner`만 프로젝트 설정(update/delete)과 멤버십 관리(project_members insert/update/delete)를 할 수 있다. `member`는 프로젝트 데이터를 읽고 쓸 수 있지만 멤버십은 바꿀 수 없다.
- **첫 로그인 시 개인용 프로젝트를 자동으로 만들지 않는다.** 로그인만으로 프로젝트가 생기면 "프로젝트 = 팀 단위 협업 공간"이라는 모델과 어긋나고(1인 1프로젝트가 기본값처럼 보이게 됨), 실제로는 관리자가 팀원을 기존 프로젝트에 초대하는 흐름이 되기 때문이다. 대신 사용자가 **원할 때 직접** 사이드바에서 프로젝트를 만들고 그 owner가 된다(아래 "첫 프로젝트 만들기"). 프로젝트 멤버십이 없는 사용자에게는 앱 상단에 "아직 배정된 프로젝트가 없습니다" 배너와 생성 안내를 보여준다(`components/layout/no-project-banner.tsx`).

### 팀원 초대 (owner가 UI에서 하는 표준 경로)

`/members`에서 owner가 이메일을 입력해 초대 링크를 만들고, 그 링크를 대상자에게 직접 전달한다(메신저·사내 메일 등). 이 저장소는 이메일을 발송하지 않는다.

- 초대 링크는 `/invite/<token>` 형태이고, **입력한 이메일 계정으로 로그인한 경우에만** 수락된다. 다른 계정으로 열면 "다른 계정으로 로그인되어 있습니다" 안내가 뜬다.
- 링크 원문 토큰은 **생성 직후 화면에서 딱 한 번만** 볼 수 있다(DB에는 sha256 해시만 저장). 잃어버리면 초대를 취소하고 새로 만든다.
- 기본 만료는 7일이며, 만료·취소·이미 수락된 초대는 다시 사용할 수 없다.
- 미로그인 상태로 초대 링크를 열면 `/login?redirectTo=/invite/<token>`으로 보내지고, 로그인 또는 회원가입 후 같은 초대 화면으로 되돌아온다(이메일 확인이 켜져 있으면 확인 메일의 링크도 같은 경로로 돌아온다).

#### 사용자 Auth 이메일 변경 / 프로필 비활성화 시 동작

- **Auth 이메일 변경**: 초대는 생성 시점의 이메일 문자열에 고정된다. 수락 전에 대상자가 Auth 이메일을 바꾸면 그 초대는 더 이상 수락할 수 없다(`email_mismatch`). owner가 새 이메일로 다시 초대해야 한다 — 초대를 "그 주소를 통제하는 사람"에게 묶어두기 위한 의도된 동작이다.
- **프로필 비활성화(`users.deactivated_at`)**: 멤버십과는 독립이다. 비활성 사용자도 기술적으로는 초대를 수락할 수 있으나, 표준 경로는 owner가 멤버 목록에서 제거하는 것이다. 멤버 목록에는 비활성 배지가 함께 표시된다.

### 첫 프로젝트 만들기 (SQL 없이, 사이드바에서)

초대 기능은 "이미 owner가 있는 프로젝트"를 전제로 하지만, **최초 프로젝트와 그 첫 owner도 이제 UI에서 만든다** — SQL Editor로 `projects` / `project_members`를 직접 INSERT하는 부트스트랩은 더 이상 필요 없다.

1. 로그인한 뒤 사이드바 아래쪽 **"프로젝트"** 영역의 **+** 버튼을 누르면 "새 프로젝트" 모달이 열린다.
2. 프로젝트 이름(1~50자)을 입력하고 **만들기**를 누른다. 취소·`Esc`·바깥 클릭으로 닫을 수 있고, 검증/RPC 오류는 모달 안에 한국어로 표시된다.
3. 만든 사람이 자동으로 그 프로젝트의 `owner`가 되고, 새 프로젝트가 즉시 활성 프로젝트로 선택된다.
4. 이후 팀원 추가는 그 owner가 `/members` 화면의 초대 링크로 수행한다(위 참고).

내부적으로는 `create_project(p_name)` RPC 한 번의 호출이고, "프로젝트 행 + 생성자 owner 멤버십"이 **한 트랜잭션**에서 만들어진다(`supabase/migrations/00000000000016_project_creation_and_rename.sql`). 중간에 실패하면 전부 롤백되므로 멤버가 없는 유령 프로젝트가 남지 않는다. service role key나 Admin API는 쓰지 않으며, 클라이언트는 `authenticated` 권한으로 RPC만 호출한다.

### 프로젝트 이름 변경 (owner 전용)

활성 프로젝트의 `owner`에게만 "프로젝트" 영역에 **연필** 버튼이 보이고, 누르면 현재 이름이 채워진 "프로젝트 이름 변경" 모달이 열린다. 이름을 바꾸면 사이드바 선택 목록·대시보드 제목에 즉시 반영되고, 멤버십·초대 링크·첨부 파일·작업/버그/채팅 데이터는 전부 그대로다(`projects.name` 한 컬럼만 바뀐다).

권한 차단은 UI가 아니라 DB가 한다 — `rename_project()` RPC가 `is_project_owner()`로 검사해 한국어 예외를 던지고, 테이블 직접 UPDATE 경로는 기존 `projects_update_owner` RLS가 막는다.

**이름 중복 정책**: 이름은 **"호출자가 속한 프로젝트들 사이에서만"** 중복될 수 없다. 전역 유니크로 두면 다른 팀이 먼저 쓴 이름을 못 쓰게 되고 남의 프로젝트 존재 여부까지 드러나므로 쓰지 않았다. 판정 기준은 `project_members` — 즉 사이드바에 보이는 목록과 정확히 같고, DB 트리거(`enforce_project_name_unique_for_actor()`)와 UI 검증(`lib/supabase/repositories/projects.ts`)이 같은 범위·같은 정규화 규칙(앞뒤 공백 제거 · 연속 공백 1칸 · 소문자)·같은 오류 문구를 쓴다. 길이 제한 1~50자는 `projects_name_length` CHECK 제약이 강제한다.

프로젝트 **영구 삭제는 아직 없다**(보관은 있다 — 바로 아래 "프로젝트 보관·복원" 참고).

### 프로젝트 보관·복원 (owner 전용)

끝난 프로젝트를 **지우지 않고** 목록에서 치우는 경로다. 영구 삭제는 여전히 구현하지 않는다.

1. owner가 사이드바 "프로젝트" 영역의 **보관 아이콘**을 누르면 확인 모달이 뜬다(실수로 즉시 실행되지 않는다).
2. 확인하면 `archive_project(p_project_id)` RPC가 `projects.archived_at`만 세운다 — 행 삭제도 cascade도 없다.
3. 보관된 프로젝트는 활성 선택 목록에서 빠지고, 그 아래 **"보관됨 N"** 접이식 목록에만 남는다.
4. 그 프로젝트의 owner에게만 **복원 버튼**이 붙고, 누르면 `restore_project(p_project_id)`가 `archived_at`을 되돌린다.

**보관해도 남는 것**: 멤버십(`project_members`), 발급해 둔 초대와 그 이력, 작업·버그·업무 영역, 채팅 채널과 메시지, 첨부 메타데이터와 Storage의 실제 파일. 보관은 상태 한 컬럼이므로 복원하면 전부 그대로 다시 쓸 수 있다.

**보관된 프로젝트는 읽기 전용**이다. 선택 목록에서 감추는 것만으로는 UI를 우회한 쓰기를 막지 못하고, 특히 삭제가 열려 있으면 "보존"이 지켜지지 않는다. 그래서 읽기 정책(`*_select_member`)은 그대로 두고 쓰기 정책만 새 헬퍼 `is_project_writable()`(프로젝트 멤버 **그리고** `archived_at is null`)로 좁혔다 — 기존 `*_all_member` 정책을 select/insert/update/delete로 분리한 것이 `00000000000017_project_archive_and_restore.sql`의 대부분이다. Storage도 조회·다운로드는 열어 두고 업로드·삭제만 막는다.

**활성 프로젝트 처리**: 지금 보고 있던 프로젝트를 보관하면 다른 활성 프로젝트로 곧바로 넘어간다. 활성 프로젝트가 하나도 남지 않으면 기존 `NoProjectBanner` 흐름을 그대로 쓰되, 배너가 "보관됨 목록에서 복원" 경로를 함께 안내한다. localStorage에 남아 있던 선택 값이 보관된 프로젝트를 가리키면 첫 활성 프로젝트로 되돌린 뒤 그 값을 다시 저장한다 — 잘못된 값이 남지 않는다.

**이름 재사용**: 이름 중복 판정은 활성 프로젝트끼리만 한다. 보관한 프로젝트의 이름은 새 프로젝트에 다시 쓸 수 있고, 대신 복원 시점에 같은 이름의 활성 프로젝트가 있으면 `restore_project()`가 "이미 같은 이름의 활성 프로젝트가 있습니다."로 거부한다(이름 트리거는 이름이 바뀔 때만 돌기 때문에 복원 경로에서 다시 본다).

**영구 삭제는 경로 자체가 없다**: `projects`의 DELETE 정책을 없앴으므로(RLS는 정책이 없으면 거부) 클라이언트가 테이블을 직접 지울 수 없고, 따라서 `on delete cascade`로 멤버십·업무 데이터가 함께 사라지는 일도 없다. UPDATE는 `owner and archived_at is null`로 좁혀 보관된 프로젝트는 이름조차 바꿀 수 없다 — `rename_project()`는 SECURITY DEFINER라 RLS를 지나치므로 함수 안에서도 같은 조건을 확인하고 "먼저 복원한 뒤 다시 시도"하라고 안내한다. 보관/복원 자체는 두 RPC로만 가능하다.

**보관 중에는 멤버와 초대도 잠긴다**: `project_members`의 INSERT/UPDATE/DELETE는 활성 프로젝트의 owner에게만 열려 있고(SELECT는 그대로), 초대 생성·취소는 RPC가 한국어 예외로 거부한다. 초대 링크 수락은 `invitation_status()` 사다리에 추가한 `archived` 상태로 막히며, 초대 화면이 "보관된 프로젝트입니다 — owner가 복원한 뒤 다시 시도해주세요"를 보여준다(링크 자체는 유효한 채로 남는다). 마지막 owner 보호 트리거는 그대로다.

권한 차단은 UI가 아니라 DB가 한다 — 두 RPC 모두 `is_project_owner()`로 검사해 한국어 예외를 던지고, `authenticated`에게만 실행 권한이 있다. member에게는 보관·복원 버튼이 보이지 않지만, 그것은 보조 수단일 뿐이다.

## 인증 흐름 요약

- `/login`, `/signup`: 이메일/비밀번호 폼(서버 액션 `lib/supabase/auth-actions.ts`). 에러/로딩 상태는 한국어로 표시된다.
- `middleware.ts` (`lib/supabase/middleware.ts`의 `updateSession`)가 모든 요청에서 세션을 갱신하고, 미인증 사용자의 `/`, `/kanban`, `/bugs`, `/chat`, `/domains`, `/schedule` 접근을 `/login`으로, 인증된 사용자의 `/login`·`/signup` 접근을 `/`로 리다이렉트한다.
- 로그아웃은 사이드바 하단 버튼에서: Supabase 세션을 끊고, 같은 브라우저에 남아있던 Zustand persist(localStorage) 목업 데이터를 지운 뒤 `/login`으로 이동한다(`lib/store/clear-persisted-stores.ts`) — 인증되지 않은 상태에서 이전 세션의 목업 데이터가 남아있지 않도록 하기 위함이다.
- 사이드바의 이름/역할은 `public.users` 프로필을 우선 쓰고, 프로필이 없으면(트리거가 아직 안 돌았거나 Supabase 미설정) 이메일 아이디나 "게스트"로 안전하게 대체된다.

## 칸반·버그 실데이터 전환 확인 항목 (사람이 직접 확인)

실제 Supabase 프로젝트를 연결한 뒤 아래를 확인한다.

- [ ] 프로젝트에 2개 이상 소속된 계정으로 로그인하면 사이드바에 프로젝트 선택 select가 뜨고, 선택이 새로고침 후에도 유지된다.
- [ ] 소속 프로젝트가 없는 계정은 "아직 배정된 프로젝트가 없습니다" 배너만 보이고 칸반/버그 화면에서 생성 버튼이 비활성화된다.
- [ ] 칸반에서 작업 생성 시 담당자 select에 활성 프로젝트 멤버만 뜨고, 생성/수정/삭제/단계 이동이 새로고침 후에도 유지된다.
- [ ] 버그 리포트 생성 시 보고자가 현재 로그인 계정으로 자동 기록되고 수정 화면에는 보고자 입력란이 없다.
- [ ] 버그의 "연결 작업" select에 활성 프로젝트의 실제 작업만 표시된다.
- [ ] 서로 다른 프로젝트에 각각 속한 두 계정으로 로그인해 상대 프로젝트의 작업/버그가 보이지 않는지 확인한다(RLS).
- [ ] `.env.local`의 Supabase 변수를 비우고 재시작하면 칸반/버그가 기존 목업 데이터로 정상 동작한다.

## 일정·업무 영역·대시보드 실데이터 전환 확인 항목 (사람이 직접 확인)

실제 Supabase 프로젝트를 연결한 뒤 아래를 확인한다.

- [ ] 일정(Gantt) 화면에서 활성 프로젝트의 실제 작업이 목록과 막대로 표시되고, 새 작업 추가/수정/삭제가 새로고침 후에도 유지된다.
- [ ] 칸반에서 작업을 이동/수정한 뒤 일정 화면을 새로고침하면 같은 데이터(상태·담당자·일정)가 정확히 반영된다.
- [ ] 일정 화면 작업 폼의 담당자 select에는 활성 프로젝트 멤버만 표시된다.
- [ ] 업무 영역 화면에서 업무 영역 추가/삭제/드래그 순서 변경이 새로고침 후에도 유지된다.
- [ ] 작업이 있는 업무 영역을 삭제해도 해당 작업은 삭제되지 않고 "미분류 작업" 목록으로 이동한다.
- [ ] 업무 영역 카드 안에서 작업을 추가/수정/삭제하면 실제 Supabase 작업 데이터에 반영된다.
- [ ] 버그와 연결된 작업이 있는 업무 영역 카드에 실제 버그 개수 아이콘이 표시된다.
- [ ] 소속 프로젝트가 없는 계정으로 로그인하면 일정/업무 영역 화면 모두 목업 데이터 대신 "소속된 프로젝트가 없습니다" 안내만 보인다.
- [ ] `.env.local`의 Supabase 변수를 비우고 재시작하면 일정/업무 영역이 기존 목업 데이터로 정상 동작한다.

대시보드는 11단계에서 정보 구조가 바뀌었다 — 아래 "대시보드 정보 구조 개선 확인 항목"을 본다.

## 대시보드 정보 구조 개선 확인 항목 (사람이 직접 확인)

`00000000000018_archive_readonly_hardening.sql`까지 적용한 실제 Supabase 프로젝트로 확인한다. 새 마이그레이션은 없다 — 기존 `tasks`/`bugs`/`chat_messages`/`asset_syncs`/`asset_categories` 테이블만 읽는다.

**최근 활동 데이터 기준(먼저 읽기)**: "최근 활동"은 완전한 수정 이력이 아니다. `tasks`/`bugs`/`chat_messages`/`asset_syncs`의 `created_at` 기준 **최근 등록·동기화·메시지**만 보여준다 — 작업 상태 변경, 담당자 재배정, 버그 상태 전환 같은 이후 수정은 반영되지 않는다. 별도 감사 로그 테이블이나 트리거는 만들지 않았다. "누가 언제 무엇을 바꿨는지"까지 남기는 진짜 수정 이력이 필요해지면 이 테이블들의 `created_at`만으로는 부족하고 별도 이벤트/감사 로그 설계가 필요하다 — 이번 단계 범위 밖이다.

**실데이터 반영**

- [ ] 활성 프로젝트에 작업/버그가 있는 상태에서 대시보드를 열면, "프로젝트 건강 요약"의 전체 작업 진행률(%)과 `done/total`이 `/kanban`에서 세어본 실제 완료/전체 작업 수와 일치한다.
- [ ] "열린 치명적 버그" 수가 `/bugs`에서 `Blocker`/`High`이면서 `Resolved`/`Closed`가 아닌 버그 개수와 일치한다.
- [ ] "내 미완료 작업" 수가 로그인 계정에게 배정된 `Done`이 아닌 작업 수와 일치한다.
- [ ] "목표일 정보 없음"이 표시되고, 과거처럼 `D-0` 같은 날짜 배지는 보이지 않는다.
- [ ] "최근 활동"에 방금 만든 작업/버그, 채팅 메시지, 대시보드에서 동기화한 에셋이 최신순으로 나타나고, 각 항목의 작성자 이름이 실제 계정과 일치한다(최대 8개).
- [ ] 채팅 메시지를 하나 더 보내거나 작업을 하나 더 만든 뒤 대시보드를 새로고침하면 "최근 활동" 맨 위에 방금 한 행동이 나타난다.
- [ ] 이미 있는 작업의 상태만 바꾸고(제목/등록은 그대로) 대시보드를 새로고침하면 "최근 활동"에 새 항목이 추가되지 **않는다**(상태 변경은 `created_at`을 바꾸지 않으므로 — 위 "데이터 기준" 설명과 일치하는지 확인).

**중복 조회 제거 · 네트워크 요청 횟수**

- [ ] 브라우저 개발자 도구 네트워크 탭에서 `rest/v1/tasks`·`rest/v1/bugs` 요청을 필터링한 채 대시보드에 처음 진입하면, **각각 정확히 1회씩만** 나간다(위젯 4개 — 건강 요약·내 작업·치명적 버그·최근 활동 — 가 각자 다시 요청하지 않는다).
- [ ] 같은 화면에서 새로고침 없이 다른 프로젝트로 전환해도 `tasks`/`bugs` 요청이 전환당 각각 1회씩만 나간다(늘어나지 않는다).
- [ ] `chat_messages`/`asset_categories`/`asset_syncs`/`attachments`/`users` 요청도 프로젝트당 한 번씩만 나가고, 작업·버그 개수가 늘어도 요청 횟수 자체는 늘지 않는다(N+1 없음).

**프로젝트 전환(race condition)**

- [ ] 프로젝트가 2개 이상인 계정에서 사이드바 선택 목록을 **빠르게 연속으로** 여러 번 바꾼다(예: A → B → C를 1초 안에). 전환을 멈춘 뒤 화면에는 항상 **마지막으로 선택한 프로젝트**의 건강 요약·내 작업·치명적 버그·최근 활동만 보여야 한다(중간에 선택했던 프로젝트의 데이터가 뒤늦게 나타나거나 섞이지 않는다).
- [ ] 네트워크 탭에서 각 요청의 응답 순서를 느리게 만들어(예: 개발자 도구의 네트워크 스로틀링) 먼저 보낸 요청이 나중에 도착하게 만든 뒤 같은 테스트를 반복해도 결과가 같다(늦게 도착한 이전 프로젝트 응답이 화면을 덮어쓰지 않는다).

**빈 상태 / 로딩 / 오류**

- [ ] 작업과 버그가 모두 없는 새 프로젝트를 활성화하면 진행률 0%·`0/0 완료`·버그 0건·미완료 작업 0건이 뜨고 에러로 보이지 않는다.
- [ ] 채팅 메시지·작업·버그·동기화된 에셋이 전혀 없는 프로젝트에서는 "최근 활동이 없습니다"가 보인다.
- [ ] 프로젝트를 전환하는 순간 잠깐 "불러오는 중입니다..."가 각 위젯에 보이고, 이전 프로젝트의 데이터가 그대로 남아있지 않는다.
- [ ] 네트워크를 끊거나 RLS로 막힌 프로젝트에서 조회를 시도하면(예: 콘솔에서 잘못된 project id로 확인) 건강 요약/내 작업/치명적 버그/최근 활동에 각각 한국어 오류 문구가 뜬다.

**활성 프로젝트 없음 / 보관 프로젝트**

- [ ] 소속 프로젝트가 없는 계정으로 로그인하면 대시보드 본문에 위젯별 안내가 반복되지 않고, 사이드바 위 `NoProjectBanner` 하나만 보인다.
- [ ] 보관된 프로젝트를 활성 프로젝트로 전환할 수는 없지만(보관 목록은 별도), 만약 그 프로젝트를 선택 중이었다면 다른 활성 프로젝트로 자동 전환된 뒤에도 대시보드가 정상적으로 그 프로젝트 데이터를 보여준다.

**최신 통합 에셋(위치·크기만 변경, 기능은 그대로)**

- [ ] 카테고리가 5개 이상인 프로젝트에서 기본으로는 최근 갱신된 4개만 보이고 "전체 보기 (N)" 버튼으로 나머지가 펼쳐진다.
- [ ] 펼친 상태에서도 카테고리 추가·파일 업로드·이름 변경·삭제가 8단계와 동일하게 전부 동작한다.

**로컬 데모 모드**

- [ ] `.env.local`의 Supabase 변수를 비우고 재시작하면 대시보드가 기존 목업 데이터(`MOCK_TASKS`/`MOCK_BUGS`/`MOCK_ACTIVITY`)로 정상 동작하고, "프로젝트 건강 요약"도 그 목업 작업/버그로 계산된 실제 백분율을 보여준다(더 이상 고정된 62%가 아니다).
- [ ] 데모 모드에서 "최근 활동"은 여전히 `MOCK_ACTIVITY` 6건을 그대로 보여준다.

## 팀 채팅 실데이터·실시간 전환 확인 항목 (사람이 직접 확인)

실제 Supabase 프로젝트를 연결한 뒤 아래를 확인한다.

- [ ] 채팅 화면에서 활성 프로젝트의 실제 채널 목록이 표시되고, 채널 생성/이름 변경이 새로고침 후에도 유지된다.
- [ ] 같은 프로젝트에서 이미 있는 채널 이름으로 새 채널을 만들면 한국어 오류 안내가 뜨고 생성되지 않는다.
- [ ] 채널을 삭제(보관)하면 안내 문구("보관된 채널은... 메시지 기록은 유지됩니다")가 뜨고, 목록에서 사라지되 메시지는 DB에 남아 있다(다른 계정으로 만든 동일 이름 채널이 다시 생성 가능한지로 간접 확인 가능).
- [ ] 메시지를 보내면 작성자가 로그인 계정 이름·역할로 기록되고, 새로고침하거나 다른 채널로 이동했다가 돌아와도 이전 메시지가 유지된다.
- [ ] 같은 채널을 두 브라우저(또는 시크릿 창)로 각각 다른 계정으로 열어 한쪽에서 메시지를 보내면 다른 쪽에 새로고침 없이 실시간으로 표시된다.
- [ ] 내가 보낸 메시지가 실시간 이벤트로 다시 들어와도 화면에 중복 표시되지 않는다.
- [ ] 소속 프로젝트가 없는 계정으로 로그인하면 채팅 화면에 목업 채널 대신 "소속된 프로젝트가 없습니다" 안내만 보인다.
- [ ] 서로 다른 프로젝트에 속한 두 계정으로 로그인해 상대 프로젝트의 채널/메시지가 보이지 않는지 확인한다(RLS).
- [ ] `.env.local`의 Supabase 변수를 비우고 재시작하면 채팅이 기존 목업 채널·메시지로 정상 동작한다.

## 채팅 파일 첨부 실업로드 확인 항목 (사람이 직접 확인)

실제 Supabase 프로젝트를 연결하고 `00000000000013_chat_attachment_realtime.sql`까지 적용한 뒤 아래를 확인한다.

- [ ] 텍스트만 있는 메시지를 보내면 기존과 동일하게 전송된다.
- [ ] 텍스트 없이 파일만 첨부해 전송하면 메시지가 전송되고(빈 텍스트 없이 첨부만 표시), 새로고침 후에도 유지된다.
- [ ] 파일 하나 + 텍스트를 함께 보내면 둘 다 같은 메시지에 표시된다.
- [ ] 파일 여러 개를 한 번에 선택해 보내면 모두 같은 메시지에 첨부로 표시된다.
- [ ] 전송 전(입력창에 붙어 있는 상태)에 첨부를 X로 제거하면 그 파일은 전송되지 않는다.
- [ ] 허용되지 않는 확장자나 20MB를 초과하는 파일을 선택하면 한국어 오류가 뜨고 해당 파일만 제외된다(나머지 파일은 정상 첨부).
- [ ] 업로드 중에는 메시지에 "업로드 중..." 표시가 잠깐 보였다가 완료되면 일반 첨부 칩으로 바뀐다.
- [ ] 업로드 실패 재현: 파일 선택 직후 네트워크 탭에서 오프라인으로 전환하거나 Storage 정책을 임시로 막은 뒤 전송 → 메시지 자체는 정상 전송되고, 실패한 첨부에만 "업로드 실패 · 재시도" 배지가 뜬다. 네트워크를 복구하고 재시도를 누르면 그 파일만 다시 업로드되어 성공 상태로 바뀐다.
- [ ] 같은 채널을 두 계정으로 열고 한쪽에서 파일을 첨부해 보내면, 메시지가 먼저 뜨고 잠시 후 다른 쪽 화면에도 첨부가 이어 붙는지(새로고침 없이) 확인한다.
- [ ] 채널을 전환하거나 채팅 화면을 벗어났다가 돌아와도 이전에 업로드한 첨부가 유지되고, 콘솔에 언마운트 후 setState 경고가 뜨지 않는다.
- [ ] 소속되지 않은 프로젝트의 활성 채널로 URL을 직접 조작해도 첨부를 볼 수 없는지 확인한다(Storage/attachments RLS는 5-A단계와 동일하게 적용된다).

## 채팅 첨부파일 삭제 확인 항목 (사람이 직접 확인)

실제 Supabase 프로젝트를 연결하고 `00000000000020_attachment_integrity_hardening.sql`까지 적용한 뒤, **서로 다른 계정 2개 이상(같은 프로젝트 멤버)**과 프로젝트 2개 이상(하나는 보관 가능)으로 확인한다. `.env.local`이 없어 원격 Supabase에 연결할 수 없는 환경에서는 이 항목들을 실제로 수행했다고 보고하지 말고, 아래 절차만 수동 검증 계획으로 남겨둔다.

**작성자 삭제 성공**

- [ ] 내가 보낸 채팅 메시지에 파일을 첨부해 전송한 뒤, 첨부 칩의 삭제 버튼을 누르면 `DeleteConfirmModal`(기존 작업/버그 삭제와 같은 컴포넌트)이 뜬다.
- [ ] 확인을 누르면 첨부 칩이 "삭제 중..." 상태를 잠깐 보인 뒤 사라지고, 메시지 본문과 그 메시지의 다른 첨부는 그대로 남는다.
- [ ] Supabase Storage 탐색기에서 해당 파일이 실제로 사라졌고, `attachments` 테이블에서도 해당 행이 삭제됐다.

**타 사용자·다른 프로젝트·보관 프로젝트 차단**

- [ ] 다른 계정(같은 프로젝트 멤버지만 그 메시지의 발신자가 아님)으로 로그인하면 그 첨부에 삭제 버튼 자체가 보이지 않는다(UI 차단).
- [ ] UI 우회 검증: 그 다른 계정의 브라우저 콘솔에서 RPC를 직접 호출하면 "메시지 작성자만 첨부파일을 삭제할 수 있습니다."로 거부된다.
  ```js
  await window.__supabase?.rpc("assert_can_delete_chat_attachment", { p_attachment_id: "<다른 사람 메시지의 첨부 id>" });
  ```
- [ ] 내가 속하지 않은 다른 프로젝트의 첨부 id로 같은 RPC를 호출하면 "이 프로젝트의 멤버만 첨부파일을 삭제할 수 있습니다."로 거부된다.
- [ ] 내가 보낸 메시지의 첨부라도, 그 프로젝트를 owner가 보관한 뒤 같은 RPC(또는 UI 삭제)를 시도하면 "보관된 프로젝트의 첨부파일은 삭제할 수 없습니다..."로 거부된다.
- [ ] 위 세 경우 모두, RPC를 우회해 `attachments`/`storage.objects`를 직접 DELETE해도 RLS가 0행으로 거부하는지 함께 확인한다.
  ```js
  await window.__supabase?.from("attachments").delete().eq("id", "<다른 사람 메시지의 첨부 id>");
  ```

**첨부 ID·경로 불일치 차단 (14단계)**

- [ ] 내가 보낸 메시지의 첨부 id로 `assert_can_delete_chat_attachment`를 호출하면, 브라우저 state가 아니라 응답으로 돌아온 `storage_path`(DB에 저장된 실제 값)만 삭제에 쓰이는지 네트워크 탭에서 확인한다(클라이언트 코드가 더 이상 로컬 `storagePath`를 인자로 넘기지 않는다 — `lib/supabase/repositories/attachments.ts`의 `deleteChatAttachment` 참고).
- [ ] UI 우회 검증: 내 첨부라도 `project_id`/`target_type`/`target_id`/`storage_path`/`uploaded_by`를 직접 UPDATE하려 하면 RLS 판정까지 가지도 못하고 "permission denied for table attachments"로 거부된다(컬럼 권한이 `original_filename`만 허용).
  ```js
  await window.__supabase?.from("attachments").update({ storage_path: "다른/경로.png" }).eq("id", "<내 첨부 id>");
  await window.__supabase?.from("attachments").update({ target_id: "<다른 메시지 id>" }).eq("id", "<내 첨부 id>");
  ```
- [ ] 대시보드 통합 에셋의 "최신 파일명 변경"(`original_filename`만 바꾸는 UPDATE)은 여전히 정상 동작한다 — 아래 "대시보드 통합 에셋 이름 변경(회귀 확인)" 참고.

**삭제 실패 후 재시도**

- [ ] 삭제 도중 네트워크를 끊거나 Storage 정책을 임시로 막은 뒤 삭제를 시도하면, 그 첨부만 "삭제 실패" 상태(재시도 버튼 포함)로 남고 메시지·다른 첨부는 영향받지 않는다.
- [ ] 네트워크/정책을 복구하고 재시도를 누르면 정상적으로 삭제된다.
- [ ] 이미 다른 탭에서 먼저 삭제된 첨부를 재시도하면(첨부를 찾을 수 없는 상태) 오류로 보이지 않고 조용히 성공(첨부가 화면에서 사라진 상태로 수렴)한다.

**Realtime 반영 (다른 세션)**

- [ ] 같은 채널을 두 브라우저(또는 시크릿 창)로 각각 다른 계정으로 열고, 한쪽에서 자신의 메시지 첨부를 삭제하면 다른 쪽 화면에도 새로고침 없이 그 첨부가 사라진다.

**대시보드 통합 에셋 이름 변경 (회귀 확인)**

- [ ] 대시보드 "최신 통합 에셋" 카드의 이름 변경(연필 아이콘)이 이번 단계 이후에도 그대로 저장되고 새로고침 후에도 유지된다 — 컬럼 권한을 `original_filename`으로 좁힌 것이 이 기능을 깨뜨리지 않았는지 확인한다.
- [ ] 작업/버그 첨부의 업로드·삭제, 대시보드 카테고리 직접 업로드·삭제도 이번 단계 이후 그대로 동작한다(이번 단계는 UPDATE 권한만 좁혔고 INSERT/DELETE는 건드리지 않았다).

## 작업·버그 첨부파일 실 업로드 전환 확인 항목 (사람이 직접 확인)

실제 Supabase 프로젝트를 연결하고 Storage 마이그레이션(`00000000000011_attachment_storage.sql`)까지 적용한 뒤 아래를 확인한다.

- [ ] 칸반에서 작업을 새로 만들면서 파일을 드래그 앤 드롭/선택으로 첨부하고 저장하면, Supabase Storage의 `attachments` 버킷에 `{project_id}/{attachment_id}/파일명` 경로로 실제 파일이 올라가고 목록에 실제 파일명·아이콘이 표시된다.
- [ ] 버그 폼에서도 동일하게 파일 첨부·저장이 되고, 새로고침 후에도 첨부 목록이 유지된다.
- [ ] 첨부 목록의 다운로드 버튼을 누르면 실제 파일이 내려받아진다(60초 내 사용해야 하는 signed URL 기반이므로 오래 열어둔 폼에서는 다시 눌러야 할 수 있다).
- [ ] 첨부 삭제(X) 버튼을 누르고 저장하면 Storage 대시보드에서도 해당 파일이 사라진다(DB 메타데이터와 함께 정리).
- [ ] 작업 또는 버그 자체를 삭제하면 연결돼 있던 첨부 파일들이 Storage/DB에서 함께 정리된다.
- [ ] 허용되지 않는 확장자나 20MB를 초과하는 파일을 첨부하면 업로드를 시도하지 않고 한국어 오류 메시지가 뜬다.
- [ ] 업로드/저장 중에는 저장 버튼이 "저장 중..."으로 바뀌고 폼을 닫을 수 없으며, 실패하면 오류 메시지와 함께 "다시 시도" 상태로 폼이 열려 있어 재제출로 복구할 수 있다.
- [ ] 서로 다른 프로젝트에 속한 두 계정으로 로그인해, 한 프로젝트의 첨부 파일 Storage 경로를 다른 프로젝트 멤버가 직접 조회/다운로드할 수 없는지 확인한다(Storage RLS).
- [ ] 소속 프로젝트가 없는 계정으로 로그인하면 작업/버그 폼의 첨부 영역이 "활성 프로젝트가 없어 첨부파일을 업로드할 수 없습니다" 안내로 대체된다.
- [ ] Figma 등 외부 링크 첨부는 여전히 별도 입력란으로 추가되고, 실 파일 업로드와 섞이지 않는다.
- [ ] `.env.local`의 Supabase 변수를 비우고 재시작하면 작업/버그 첨부가 기존 목업 첨부·목업 다운로드로 정상 동작한다.

## 팀 멤버 초대·권한 관리 확인 항목 (사람이 직접 확인)

실제 Supabase 프로젝트를 연결하고 `00000000000012_project_invitations_and_member_management.sql`까지 적용한 뒤, owner 계정 1개와 아직 멤버가 아닌 계정 1~2개로 아래를 확인한다.

**초대 생성 / 수락**

- [ ] owner로 `/members`에 들어가면 멤버 목록(이름·이메일·역할)과 초대 폼이 보이고, member 계정으로 들어가면 이메일이 가려진 읽기 전용 목록과 "owner만 변경할 수 있습니다" 안내가 보인다.
- [ ] owner가 이메일을 입력해 초대를 만들면 초대 링크가 화면에 1회 표시되고, "복사" 버튼으로 클립보드에 복사된다. 콜아웃을 닫으면 같은 링크를 다시 볼 수 없다.
- [ ] 로그아웃 상태로 초대 링크를 열면 `/login?redirectTo=/invite/...`로 이동하고, 로그인(또는 회원가입) 후 자동으로 초대 화면으로 돌아온다.
- [ ] 초대받은 이메일 계정으로 수락하면 성공 화면이 뜨고, 사이드바의 활성 프로젝트가 그 프로젝트로 바뀌며 대시보드에서 실제 데이터가 보인다.
- [ ] 수락 후 owner의 `/members` 초대 목록에서 해당 초대가 "수락됨"으로 바뀌고 수락자 이름이 남는다.

**차단되어야 하는 경우**

- [ ] 초대받지 않은 다른 이메일 계정으로 같은 링크를 열면 "다른 계정으로 로그인되어 있습니다" 안내가 뜨고 수락 버튼이 없다.
- [ ] 이미 수락한 링크를 다시 열면 "이미 수락된 초대입니다"가 뜬다.
- [ ] owner가 초대를 취소한 뒤 그 링크를 열면 "취소된 초대입니다"가 뜬다.
- [ ] 존재하지 않는 토큰(URL 임의 변경)으로 접근하면 "초대를 찾을 수 없습니다"가 뜬다.
- [ ] 만료 확인: SQL Editor에서 `update public.project_invitations set expires_at = now() - interval '1 day' where id = '<초대 id>';` 실행 후 링크를 열면 "만료된 초대입니다"가 뜨고, 목록에도 "만료됨"으로 표시된다.
- [ ] 이미 멤버인 이메일로 초대를 만들면 "이미 이 프로젝트의 멤버입니다" 오류가 뜬다.
- [ ] 같은 이메일로 대기 중 초대가 있는데 또 만들면 "이미 대기 중인 초대가 있습니다" 오류가 뜬다.

**역할 변경 / 멤버 제거 / 마지막 owner 보호**

- [ ] owner가 member의 역할을 owner로 올리고 다시 member로 내릴 수 있다. 변경 후 해당 계정에서 `/members`의 권한 표시가 바뀐다.
- [ ] owner가 member를 제거하면 그 계정에서는 해당 프로젝트가 사이드바 선택지에서 사라지고, 작업·버그·채팅에 접근할 수 없다(RLS).
- [ ] owner가 1명뿐일 때 그 owner의 역할 select와 제거 버튼이 비활성화된다.
- [ ] UI 우회 검증: 브라우저 콘솔에서 마지막 owner를 직접 강등/삭제해도 DB 트리거가 "프로젝트에는 최소 한 명의 owner가 있어야 합니다."로 거부한다.
  ```js
  // 콘솔에서 실행 — 반드시 에러가 나야 정상
  await window.__supabase?.from("project_members").delete().eq("project_id", "<project id>").eq("user_id", "<마지막 owner id>");
  ```
  (전역 클라이언트가 없으면 owner를 1명으로 만든 뒤 SQL Editor에서 같은 delete를 실행해 예외가 나는지 확인한다.)
- [ ] member 계정으로 다른 멤버의 역할을 바꾸거나 초대를 만들려고 하면 RLS/RPC가 거부한다(`프로젝트 owner만 ...` 오류).

**노출 범위**

- [ ] member 계정에서 `select * from public.project_invitations`를 실행하면 0행이 반환된다(owner 전용 SELECT 정책).
- [ ] member 계정의 멤버 목록에서 다른 멤버의 이메일이 "이메일은 owner만 볼 수 있습니다"로 가려진다.

## 대시보드 통합 에셋 실데이터·직접 업로드 확인 항목 (사람이 직접 확인)

실제 Supabase 프로젝트를 연결하고 `00000000000015_remove_asset_category_rpc.sql`까지 적용한 뒤 아래를 확인한다.

- [ ] 대시보드 "최신 통합 에셋" 위젯에서 카테고리를 추가하면 실제로 생성되고, 새로고침 후에도 유지된다.
- [ ] 같은 프로젝트에서 이미 있는 이름으로 카테고리를 또 만들면 한국어 오류가 뜨고 생성되지 않는다.
- [ ] 카테고리 카드에서 파일을 클릭 선택 또는 드래그로 업로드하면 "업로드 중..." 표시 후 실제 파일로 채워지고, 출처가 "대시보드에서 직접 업로드"로 표시된다.
- [ ] 허용되지 않는 확장자나 20MB를 초과하는 파일을 올리면 한국어 오류가 뜨고 카테고리는 비어 있는 채로 남는다(다시 업로드해 재시도 가능).
- [ ] 업로드된 파일의 다운로드 버튼을 누르면 signed URL로 실제 파일이 열린다.
- [ ] 최신 에셋 이름을 수정(연필 아이콘)하면 저장되고 새로고침 후에도 유지된다.
- [ ] 칸반/일정/업무 영역에서 **이미 저장된** 작업을 열어 첨부의 "대시보드 통합 파일로 갱신" 토글을 켜고 카테고리를 선택한 뒤 저장하면, 파일이 재업로드되지 않고 대시보드 위젯에 그 첨부가 나타나며 출처가 작업 제목으로 표시된다.
- [ ] 작업을 새로 만들면서 방금 추가한 첨부에도 곧바로 "대시보드 통합 파일로 갱신" 토글을 켜고 카테고리를 선택해 저장하면(같은 세션), 그 첨부가 정상적으로 대시보드 위젯에 나타난다.
- [ ] 작업/버그/채팅에서 동기화된 원본 첨부가 있는 카테고리를 삭제하면 확인 모달("작업·버그·채팅에서 동기화된 원본 첨부는 그대로 남습니다")이 뜨고, 확인 후 카테고리는 사라지지만 원본 작업/버그/채팅 화면의 첨부는 그대로 남아 있다.
- [ ] 대시보드에서 직접 업로드한 파일만 있는 카테고리를 삭제하면, Storage에서도 해당 파일이 사라진다(Supabase 대시보드의 Storage 탐색기에서 확인).
- [ ] 소속 프로젝트가 없는 계정으로 로그인하면 통합 에셋 위젯에 목업 카테고리 대신 "소속된 프로젝트가 없습니다" 안내만 보인다.
- [ ] 서로 다른 프로젝트에 속한 두 계정으로 로그인해 상대 프로젝트의 카테고리/에셋이 보이지 않는지 확인한다(RLS).
- [ ] `.env.local`의 Supabase 변수를 비우고 재시작하면 통합 에셋 위젯과 작업 폼의 동기화 토글이 기존 목업 카테고리로 정상 동작한다(카테고리 빠른 생성 버튼도 다시 보인다).

## 프로젝트 생성·이름 변경 확인 항목 (사람이 직접 확인)

실제 Supabase 프로젝트를 연결하고 `00000000000016_project_creation_and_rename.sql`까지 적용한 뒤, **아직 어떤 프로젝트에도 속하지 않은 계정 1개**와 기존 member 계정 1개로 아래를 확인한다.

**프로젝트 생성**

- [ ] 소속 프로젝트가 없는 계정으로 로그인하면 상단 배너가 "사이드바 + 버튼으로 새 프로젝트를 만들거나 초대 링크를 요청하라"고 안내하고, 사이드바 "프로젝트" 영역에 + 버튼이 보인다.
- [ ] + 버튼을 누르면 화면 중앙에 "새 프로젝트" 모달이 뜨고, 입력란에 포커스가 가 있으며, `Esc`·바깥 클릭·"취소"로 닫힌다(닫았다 다시 열면 입력값이 비어 있다).
- [ ] + 버튼 → 이름 입력 → "만들기"로 프로젝트가 생성되고 모달이 닫히며, SQL Editor를 전혀 쓰지 않고도 대시보드/칸반/버그/채팅이 실데이터 모드로 동작한다.
- [ ] 이름을 비우거나 공백만 입력하면 "프로젝트 이름을 입력해주세요.", 51자 이상이면 "프로젝트 이름은 50자 이하로 입력해주세요."가 **모달 안에** 뜨고, 모달은 닫히지 않으며 프로젝트도 생성되지 않는다(오류가 뜬 뒤 다시 입력하면 문구가 사라진다).
- [ ] 이미 내가 속한 프로젝트와 같은 이름(대소문자·앞뒤 공백만 다른 경우 포함)으로 만들면 "이미 같은 이름의 프로젝트가 있습니다."가 뜨고 생성되지 않으며, 모달을 닫아도 사이드바 선택 목록이 그대로다(실패한 optimistic 상태가 남지 않는다).
- [ ] 다른 계정이 이미 같은 이름의 프로젝트를 갖고 있어도, 내가 속하지 않은 프로젝트라면 같은 이름으로 만들 수 있다(중복 판정은 내 소속 목록 기준).
- [ ] `/members`에서 방금 만든 프로젝트의 멤버 목록에 내가 `owner`로 1명 있고, 초대 폼이 보인다.

**생성 직후 활성 프로젝트 전환**

- [ ] 프로젝트를 만들면 사이드바 선택 값·선택 목록과 대시보드 제목이 **곧바로** 새 프로젝트로 바뀐다(다른 프로젝트로 튀지 않는다).
- [ ] 프로젝트가 2개 이상일 때 사이드바 선택 목록에서 다른 프로젝트로 전환하면 대시보드·칸반·버그·채팅이 그 프로젝트 데이터로 바뀌고, 새로고침 후에도 전환한 프로젝트가 유지된다.
- [ ] 이미 프로젝트가 2개 이상인 계정에서 새 프로젝트를 만들어도 첫 번째 프로젝트로 되돌아가지 않고, 새로고침 후에도 새 프로젝트가 선택된 상태로 남는다.

**생성 실패 시 롤백(부분 생성 없음)**

- [ ] 중복 이름으로 생성이 거부된 뒤 SQL Editor에서 `select count(*) from public.projects where name = '<그 이름>';`을 확인하면 프로젝트 행이 늘어나 있지 않다.
- [ ] SQL Editor에서 `select p.id, p.name from public.projects p left join public.project_members m on m.project_id = p.id where m.project_id is null;`을 실행하면 부트스트랩 시드(`Default Project`) 외에 **멤버가 없는 프로젝트가 생기지 않았음**을 확인할 수 있다.

**이름 변경 / member 권한 차단**

- [ ] owner 계정에는 "프로젝트" 영역에 연필 버튼이 보이고, 누르면 현재 이름이 채워진 "프로젝트 이름 변경" 모달이 열린다.
- [ ] 이름을 바꾸면 사이드바 선택 목록·대시보드 제목이 즉시 새 이름으로 바뀐다(새로고침 없이).
- [ ] 이름 변경이 실패하면(예: 내가 속한 다른 프로젝트와 같은 이름) 모달에 오류가 뜨고, 사이드바·대시보드 제목은 **옛 이름 그대로**다.
- [ ] 이름 변경 후에도 그 프로젝트의 작업·버그·채팅·첨부 파일과 `/members`의 멤버 목록·발급해 둔 초대 링크가 그대로 동작한다.
- [ ] member 계정으로 같은 프로젝트를 활성화하면 연필 버튼이 **보이지 않는다**(+ 버튼은 그대로 보인다 — 누구나 자기 프로젝트는 만들 수 있다).
- [ ] UI 우회 검증: member 계정의 브라우저 콘솔에서 RPC를 직접 호출하면 "프로젝트 owner만 이름을 변경할 수 있습니다."로 거부된다.

  ```js
  await window.__supabase?.rpc("rename_project", { p_project_id: "<project id>", p_name: "해킹" });
  ```

  (전역 클라이언트가 없으면 Supabase 대시보드에서 member 계정 JWT로 같은 RPC를 호출해 예외가 나는지 확인한다.)
- [ ] 미로그인(anon) 상태에서 `create_project` / `rename_project`를 호출하면 실행 권한이 없어 거부된다(`grant execute ... to authenticated`만 부여).

## 프로젝트 보관·복원 확인 항목 (사람이 직접 확인)

`00000000000018_archive_readonly_hardening.sql`까지 적용한 뒤(17만 적용하면 영구 삭제·보관 중 멤버·초대 경로가 열려 있다 — 위 "프로젝트 보관 기능에 필요한 적용 순서" 참고), **프로젝트 2개 이상에 속한 owner 계정**과 같은 프로젝트의 member 계정으로 확인한다.

**보관**

- [ ] owner에게만 "프로젝트" 영역에 보관 아이콘이 보이고, 누르면 곧바로 실행되지 않고 확인 모달("… 프로젝트를 보관하시겠습니까?")이 먼저 뜬다.
- [ ] 모달에서 "취소"를 누르면 아무 일도 일어나지 않는다(프로젝트가 그대로 활성 목록에 남아 있다).
- [ ] "보관"을 누르면 그 프로젝트가 활성 선택 목록에서 사라지고, 아래 "보관됨 N" 목록이 펼쳐지며 그 안에 나타난다.
- [ ] 보관 직후 화면이 **다른 활성 프로젝트로 자동 전환**된다(대시보드 제목·사이드바 선택 값이 함께 바뀐다). 새로고침해도 보관된 프로젝트로 되돌아가지 않는다.
- [ ] 활성 프로젝트를 전부 보관하면 "활성 프로젝트가 없습니다" 배너가 뜨고, 배너가 보관됨 목록에서 복원하라고 안내한다.

**데이터 보존 (보관은 삭제가 아니다)**

- [ ] SQL Editor에서 보관한 프로젝트의 데이터가 그대로인지 확인한다: `select count(*) from public.tasks where project_id = '<id>';` (버그·채팅 메시지·첨부도 동일하게 확인) — 보관 전후 개수가 같아야 한다.
- [ ] `select count(*) from public.project_members where project_id = '<id>';` 로 멤버십이 남아 있고, 발급해 둔 초대 행도 그대로인지 확인한다.
- [ ] Supabase Storage 탐색기에서 그 프로젝트 경로의 첨부 파일이 그대로 남아 있다.

**보관 중 읽기 전용 (RLS)**

- [ ] 브라우저 콘솔에서 보관된 프로젝트에 직접 쓰기를 시도하면 거부된다(0행 갱신 또는 RLS 오류).

  ```js
  await window.__supabase?.from("tasks").insert({ project_id: "<보관된 project id>", title: "테스트", status: "todo", priority: "Medium" });
  await window.__supabase?.from("tasks").delete().eq("project_id", "<보관된 project id>");
  ```

- [ ] 같은 방식으로 조회(`select`)는 여전히 되는지 확인한다 — 보관 데이터는 읽을 수 있어야 한다.

**복원 / member 차단**

- [ ] owner가 보관됨 목록의 복원 버튼을 누르면 그 프로젝트가 다시 활성 선택 목록에 나타나고, 선택하면 작업·버그·채팅·첨부가 보관 전 그대로 보인다(쓰기도 다시 된다).
- [ ] 보관해 둔 이름과 같은 이름으로 새 프로젝트를 만들 수 있다(중복 판정은 활성 프로젝트끼리만). 그 상태에서 원래 프로젝트를 복원하면 "이미 같은 이름의 활성 프로젝트가 있습니다."로 거부된다.
- [ ] member 계정에는 보관 아이콘이 **보이지 않고**, 보관됨 목록의 항목에도 복원 버튼이 붙지 않는다(목록은 읽기 전용으로 보인다).
- [ ] UI 우회 검증: member 계정 콘솔에서 RPC를 직접 호출하면 한국어 예외로 거부된다.

  ```js
  await window.__supabase?.rpc("archive_project", { p_project_id: "<project id>" });
  await window.__supabase?.rpc("restore_project", { p_project_id: "<project id>" });
  ```

- [ ] 미로그인(anon) 상태에서 두 RPC를 호출하면 실행 권한이 없어 거부된다(`grant execute ... to authenticated`만 부여).
- [ ] `.env.local`의 Supabase 변수를 비우고 재시작하면 사이드바 프로젝트 영역이 사라지고 기존 목업(demo) 화면이 그대로 동작한다.

**영구 삭제 차단 (직접 DELETE)**

- [ ] owner 계정 콘솔에서 프로젝트를 직접 지우려 해도 아무 행도 지워지지 않는다(정책이 없어 RLS가 거부한다).

  ```js
  await window.__supabase?.from("projects").delete().eq("id", "<project id>");
  ```

- [ ] 위 시도 후 SQL Editor에서 `select count(*) from public.projects where id = '<project id>';` 가 여전히 1이고, 그 프로젝트의 작업·버그·멤버십 개수도 그대로다(cascade가 일어나지 않았다).
- [ ] 보관된 프로젝트의 이름을 직접 바꾸려 해도 0행만 갱신된다. RPC로 호출하면 "보관된 프로젝트의 이름은 변경할 수 없습니다. 먼저 복원한 뒤 다시 시도해주세요."로 거부된다.

  ```js
  await window.__supabase?.from("projects").update({ name: "우회" }).eq("id", "<보관된 project id>");
  await window.__supabase?.rpc("rename_project", { p_project_id: "<보관된 project id>", p_name: "우회" });
  ```

- [ ] 직접 UPDATE로 보관/복원도 되지 않는다: `update({ archived_at: null })`, `update({ archived_at: "..." })` 모두 0행이다(그 경로는 `archive_project` / `restore_project` RPC뿐이다).

**보관 중 멤버·초대 차단**

- [ ] 보관된 프로젝트에서 멤버를 추가·제거하거나 역할을 바꾸려 해도 0행만 갱신된다(활성 프로젝트의 owner에게만 열려 있다).

  ```js
  await window.__supabase?.from("project_members").delete().eq("project_id", "<보관된 project id>").eq("user_id", "<member id>");
  ```

- [ ] 멤버 목록 조회(`list_project_members`)는 그대로 된다 — 보관해도 누가 속해 있었는지는 계속 볼 수 있어야 한다.
- [ ] 보관된 프로젝트에서 초대를 만들면 "보관된 프로젝트에는 멤버를 초대할 수 없습니다."로 거부된다.

  ```js
  await window.__supabase?.rpc("create_project_invitation", { p_project_id: "<보관된 project id>", p_email: "a@b.com", p_role: "member" });
  ```

- [ ] 보관 전에 발급해 둔 초대를 취소하려 하면 "보관된 프로젝트의 초대는 변경할 수 없습니다."로 거부된다.

**보관된 프로젝트의 초대 링크 수락 차단**

- [ ] 프로젝트를 보관하기 **전에** 초대 링크를 발급해 두고, 보관한 뒤 초대받은 계정으로 그 링크를 연다 → "보관된 프로젝트입니다" 안내가 뜨고 수락 버튼이 없다.
- [ ] 그 상태에서 SQL Editor로 확인하면 초대는 여전히 `pending`이고 멤버십도 늘지 않았다(수락이 실제로 막혔다).
- [ ] owner가 프로젝트를 복원한 뒤 같은 링크를 다시 열면 정상적으로 수락되고 멤버로 합류된다(링크는 그대로 유효했다).

**복원 동시성**

- [ ] 같은 이름으로 "새 프로젝트 생성"과 "보관된 프로젝트 복원"을 거의 동시에 실행해도 활성 프로젝트 이름이 겹치지 않는다(한쪽이 한국어 오류로 거부된다). 복원은 이름 검사 전에 호출자의 `users` 행을 잠가 생성·이름 변경과 직렬화된다.

## 첨부파일 미리보기 · 통합 에셋 버전 이력/비교 확인 항목 (사람이 직접 확인)

실제 Supabase 프로젝트(첨부 Storage 버킷까지 설정된 상태)에 이미지 파일을 몇 개 올려둔 뒤 확인한다. 새 마이그레이션은 없다 — 기존 `attachments`/`asset_syncs`와 Storage RLS를 그대로 쓴다.

**이미지 미리보기 — 작업/버그**

- [ ] 작업 폼에서 이미지 파일(.png/.jpg 등)을 첨부하고 저장한 뒤 다시 열면, 그 첨부에만 미리보기(눈 모양) 버튼이 붙는다 — 스프레드시트·zip·spine 등 다른 종류에는 붙지 않는다.
- [ ] 미리보기 버튼을 누르면 로딩 상태가 잠깐 보인 뒤 이미지가 모달 안에 꽉 차지 않고 비율을 유지한 채(`object-contain`) 표시된다.
- [ ] `Esc`, 모달 바깥(어두운 배경) 클릭, 우측 상단 닫기 버튼 세 가지 모두로 닫힌다. 모달 안(이미지·헤더)을 클릭해서는 닫히지 않는다.
- [ ] 버그 폼에서도 동일하게 동작한다.
- [ ] 이미지가 아닌 첨부(스프레드시트, zip 등)는 기존처럼 다운로드 버튼만 있고 미리보기 버튼이 없으며, 다운로드가 그대로 동작한다.
- [ ] 외부 링크 첨부(Figma 등)는 미리보기 버튼 없이 기존처럼 새 탭 링크(외부 아이콘)로만 열린다 — 이미지로 취급되지 않는다.
- [ ] 아직 업로드가 끝나지 않은 상태(느린 네트워크 등)에서 미리보기를 누르면 "파일을 찾을 수 없습니다" 오류가 뜨고 화면이 깨지지 않는다.

**이미지 미리보기 — 채팅**

- [ ] 채팅에서 이미지 파일을 전송하면 첨부 칩에 다운로드(파일명 클릭)와 별개로 미리보기(눈 모양) 아이콘이 붙는다.
- [ ] 미리보기를 누르면 모달로 이미지가 뜨고, 닫으면 채팅 화면으로 정상 복귀한다.
- [ ] 이미지가 아닌 첨부는 기존처럼 파일명 클릭 다운로드만 있다.

**이미지 미리보기 — 대시보드 통합 에셋**

- [ ] "최신 통합 에셋" 카드 중 현재 파일이 이미지인 카드에 미리보기 버튼이 보이고, 스프레드시트/zip/Figma 링크 카드에는 보이지 않는다.
- [ ] 카테고리 추가·파일 업로드(교체 포함)·이름 변경·삭제가 이전과 동일하게 전부 동작한다(이번 단계에서 건드리지 않았다).

**통합 에셋 버전 이력**

- [ ] 같은 카테고리에 파일을 2회 이상 업로드(또는 작업/버그 첨부를 "대시보드 통합 파일로 갱신"으로 동기화)한 뒤, 그 카드의 "버전 이력" 버튼을 누르면 모달이 열리고 방금 올린 파일이 맨 위(최신 배지)에, 이전 파일이 아래에 최신순으로 나열된다.
- [ ] 브라우저 네트워크 탭에서 이력을 여는 순간 `asset_syncs`·`attachments` 요청이 각 1회씩만 나가는지 확인한다(버전이 여러 개여도 첨부마다 따로 요청하지 않는다).
- [ ] 대시보드에 처음 진입했을 때는 이 요청들이 전혀 나가지 않고, "버전 이력"을 누른 순간에만 나간다(지연 조회).
- [ ] 각 버전 행에 파일명·source label·등록 시각(상대 시간)이 보이고, 이미지 버전에는 미리보기·다운로드 버튼이, 이미지가 아닌 버전에는 다운로드 버튼만 보인다.
- [ ] 원본 작업/버그를 삭제해 그 첨부가 사라진 뒤(첨부는 작업/버그 삭제 시 함께 정리된다) 이력을 다시 열면, 그 버전이 "파일을 찾을 수 없음"으로 표시될 뿐 모달 전체가 깨지거나 나머지 버전이 사라지지 않는다.

**이미지 버전 비교**

- [ ] 버전 이력에서 이미지 버전에만 체크박스가 붙고, 이미지가 아닌 버전(스프레드시트 등)에는 체크박스가 없다.
- [ ] 이미지 버전을 2개 선택하면 "선택한 버전 비교" 버튼이 활성화되고, 3개째를 선택하려 하면 막힌다(먼저 하나를 해제해야 한다).
- [ ] 비교를 누르면 두 이미지가 좌우로 나란히 보이고, 각 이미지 위에 그 버전의 파일명·source label·등록 시각이 표시된다.
- [ ] "← 목록으로"를 누르면 버전 이력으로 돌아가고, 닫기(X)를 누르면 완전히 닫힌다.
- [ ] (재현 가능하다면) 한쪽 버전의 Storage 파일만 다른 방법으로 지워 signed URL 생성이 실패하게 만들면, 그쪽 패널에만 오류가 뜨고 반대쪽은 정상적으로 이미지가 보인다.
- [ ] 비교 화면에는 다운로드 버튼이나 편집 기능이 없다 — 단순 좌우 보기만 있다.

**로컬 데모 모드**

- [ ] `.env.local`의 Supabase 변수를 비우고 재시작하면, 작업/버그 폼의 이미지 첨부(`waveform_reference.png` 등)에 미리보기 버튼이 보이지 않고 기존 목업 다운로드 버튼만 보인다.
- [ ] 대시보드 "최신 통합 에셋" 카드에도 미리보기·버전 이력 버튼이 보이지 않고, 업로드·이름 변경·삭제·다운로드는 이전과 동일하게 동작한다.

## 원격 Supabase 통합 검증 마스터 체크리스트 (15단계)

실제 원격 Supabase 프로젝트에 migration 1~20을 전부 적용한 뒤, 한 번에 훑어보는 요약 체크리스트다. 각 항목의 세부 절차·엣지 케이스·SQL 우회 검증은 이미 위의 해당 "OO 확인 항목" 절에 있다 — 여기서는 그 절들을 순서대로 모아 빠뜨리는 항목이 없게 하는 것이 목적이다. 이 체크리스트는 원격 프로젝트가 실제로 연결되고 위 "원격 Supabase 연결 프리플라이트"의 준비가 끝난 뒤에만 의미가 있다 — `.env.local`이 없는 환경에서는 수행했다고 보고하지 말고 계획으로만 남겨둔다.

- [ ] **회원가입/로그인/로그아웃**: 서로 다른 계정 2개로 각각 회원가입 → (Confirm email 설정에 따라 인증 후) 로그인 → 로그아웃까지 정상 동작한다("Supabase Auth 설정", "인증 흐름 요약" 참고).
- [ ] **프로젝트 생성·이름 변경·보관·복원**: "프로젝트 생성·이름 변경 확인 항목", "프로젝트 보관·복원 확인 항목" 전체.
- [ ] **owner/member 권한 차이**: 위 두 절의 member 차단 항목들 + "팀 멤버 초대·권한 관리 확인 항목"의 역할 변경 절.
- [ ] **초대 링크 생성·수락·만료·취소**: "팀 멤버 초대·권한 관리 확인 항목" 전체.
- [ ] **작업·버그·채팅 CRUD**: "칸반·버그 실데이터 전환 확인 항목", "일정·업무 영역·대시보드 실데이터 전환 확인 항목", "팀 채팅 실데이터·실시간 전환 확인 항목".
- [ ] **채팅 메시지 첨부 업로드·삭제·재시도**: "채팅 파일 첨부 실업로드 확인 항목" 전체 + "채팅 첨부파일 삭제 확인 항목"의 "작성자 삭제 성공"·"삭제 실패 후 재시도".
- [ ] **작성자가 아닌 사용자의 채팅 첨부 삭제 차단**: "채팅 첨부파일 삭제 확인 항목"의 "타 사용자·다른 프로젝트·보관 프로젝트 차단"과 "첨부 ID·경로 불일치 차단".
- [ ] **보관 프로젝트의 모든 쓰기 차단**: "프로젝트 보관·복원 확인 항목"의 "보관 중 읽기 전용(RLS)" + "채팅 첨부파일 삭제 확인 항목"의 보관 프로젝트 차단.
- [ ] **다른 프로젝트 데이터·Storage 접근 차단**: 칸반/버그·채팅·작업/버그 첨부·대시보드 통합 에셋 각 확인 항목 절의 "서로 다른 프로젝트에 속한 두 계정으로..." 항목.
- [ ] **두 브라우저 세션 간 Realtime 반영**: "팀 채팅 실데이터·실시간 전환 확인 항목", "채팅 파일 첨부 실업로드 확인 항목", "채팅 첨부파일 삭제 확인 항목"의 Realtime 반영 항목 세 가지.
- [ ] **대시보드 실제 지표와 원본 데이터 일치**: "대시보드 정보 구조 개선 확인 항목"의 "실데이터 반영" 절.
- [ ] **이미지 미리보기·에셋 버전 이력·비교**: "첨부파일 미리보기 · 통합 에셋 버전 이력/비교 확인 항목" 전체.
- [ ] **로컬 데모 모드 회귀 확인**: `.env.local`의 Supabase 변수를 비우고 재시작해, 위 각 절의 "로컬 데모 모드" 항목들이 전부 기존 목업 동작으로 정상 회귀하는지 확인한다.
