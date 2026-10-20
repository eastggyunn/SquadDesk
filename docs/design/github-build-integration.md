# GitHub 빌드 연동 설계안

> 상태: 설계 (구현 전) · 작성 2026-10-20 · 결정 반영 2026-10-20

## 1. 목표

- 프로젝트에 참여한 **멤버 누구나** 본인이 관리하는 GitHub 저장소를 버튼 몇 번으로 연결한다.
- 연결 후에는 개발자가 `push`만 하면 CI가 만든 **성공한 빌드**가 SquadDesk에 자동 등록되고 팀원에게 알림이 간다.
- GitHub 권한이 없는 팀원(기획·아트·QA)도 **SquadDesk 로그인만으로 빌드를 다운로드**한다.
- 빌드를 **태스크·스프린트에 연결**해서 "이 작업이 들어간 빌드", "이번 스프린트 빌드"를 바로 찾는다.
- 빌드 파일은 SquadDesk Storage에 저장하지 않는다 → 50MB 업로드 제한 / 1GB 저장 한도와 무관.

### 확정된 결정

| 항목 | 결정 |
|---|---|
| 저장소 연결 권한 | 게스트를 제외한 **프로젝트 멤버 누구나** 자기 저장소를 연결 |
| 실패한 빌드 | **저장하지 않음.** 성공한 실행만 받아들이고 나머지 이벤트는 무시 |
| 태스크·마일스톤 연결 | **1차 범위에 포함.** 마일스톤은 기존 `sprints`(스프린트)로 대응 |

### 범위 밖 (이번 단계에서 하지 않음)

- GitHub 외 CI(GitLab, Jenkins, Unity Cloud Build) — `provider` 컬럼으로 확장 여지만 둔다.
- 빌드 트리거(SquadDesk에서 빌드 실행), 커밋/PR 목록 동기화, GitHub 이슈 연동.
- 커밋 메시지로 태스크 자동 연결 — 태스크에 짧은 키(예: `T-123`)가 없어서 2차로 미룸. 1차는 수동 연결.
- 아트·영상 원본 대용량 공유(기존 첨부 50MB 제한 문제는 별도 과제).

## 2. 방식: GitHub App

개인 토큰(PAT)이나 OAuth App이 아니라 **GitHub App** 하나를 SquadDesk 명의로 등록하고, 각 사용자가 자기 계정/조직에 그 앱을 "설치"한다.

| 항목 | GitHub App이 해주는 것 |
|---|---|
| 연결 UX | 설치 화면에서 저장소 선택 → SquadDesk로 복귀. 토큰 복사·webhook 등록 없음 |
| Webhook | 앱 단위 1개 URL로 모든 설치의 이벤트가 들어옴 |
| 권한 | 사용자가 고른 저장소만, 읽기 전용 |
| 토큰 | 저장하지 않음. 필요할 때 1시간짜리 설치 토큰을 발급 |
| 해제 | 사용자가 GitHub에서 앱 제거 → `installation.deleted` 이벤트로 자동 정리 |

### 2.1 App 등록 설정 (1회, 사용자가 GitHub에서 직접)

- **Homepage URL**: `https://squad-desk-one.vercel.app`
- **Request user authorization (OAuth) during installation**: 체크 (설치자 검증용, §4.2)
- **Callback URL**: `https://squad-desk-one.vercel.app/api/github/setup` — "Redirect on update" 체크
  (OAuth-on-install을 켜면 Setup URL 칸은 비활성되고, 설치 후 Callback URL로 `code`·`installation_id`·`setup_action`이 함께 온다)
- **Webhook URL**: `https://squad-desk-one.vercel.app/api/github/webhook`, Secret 설정
- **Repository permissions** (모두 Read-only)
  - Metadata: Read (필수)
  - Actions: Read — 워크플로 실행·artifact 조회/다운로드
  - Contents: Read — Release·Release asset 조회/다운로드
- **Subscribe to events**: `Workflow run`, `Release`, `Repository`
  (`installation`, `installation_repositories`는 자동 수신)
- **Where can this app be installed**: Any account

### 2.2 환경 변수 (Vercel + `.env.local`)

| 이름 | 용도 |
|---|---|
| `GITHUB_APP_ID` | JWT 발급 |
| `GITHUB_APP_SLUG` | 설치 URL `https://github.com/apps/<slug>/installations/new` |
| `GITHUB_APP_PRIVATE_KEY` | JWT 서명(RS256). 줄바꿈은 `\n` 이스케이프로 저장 |
| `GITHUB_APP_CLIENT_ID` / `GITHUB_APP_CLIENT_SECRET` | 설치 시 사용자 인가 코드 교환 |
| `GITHUB_WEBHOOK_SECRET` | `X-Hub-Signature-256` 검증 |
| `SUPABASE_SERVICE_ROLE_KEY` | (기존) webhook에서 RLS 우회 쓰기 |

라이브러리는 추가하지 않는다. JWT는 Node `crypto.createSign("RSA-SHA256")`, API는 `fetch`로 충분하다 (호출하는 엔드포인트가 6~7개뿐).

## 3. 데이터 모델 (마이그레이션 31)

```sql
-- GitHub App 설치 1건 = GitHub 계정/조직 1개. 여러 프로젝트가 공유할 수 있다.
create table public.github_installations (
  installation_id  bigint primary key,
  account_login    text not null,
  account_type     text not null check (account_type in ('User', 'Organization')),
  installed_by     uuid references public.users (id) on delete set null,
  suspended_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 프로젝트 ↔ 저장소 연결. 멤버마다, 한 프로젝트에 여러 저장소(클라이언트/서버 등) 가능.
create table public.project_repositories (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects (id) on delete cascade,
  provider          text not null default 'github' check (provider in ('github')),
  installation_id   bigint not null references public.github_installations (installation_id) on delete cascade,
  repo_id           bigint not null,          -- GitHub 저장소 숫자 id (이름 변경에도 불변)
  repo_full_name    text not null,            -- 표시용, 'owner/name' (이벤트마다 갱신)
  build_source      text not null default 'artifact'
                      check (build_source in ('artifact', 'release', 'both')),
  workflow_path     text,                     -- 예: '.github/workflows/main.yml'. null = 전체
  branch_filter     text,                     -- 예: 'main'. null = 전체 브랜치
  connected_by      uuid not null references public.users (id) on delete cascade,
  disconnected_at   timestamptz,              -- 앱 제거/저장소 제외/연결자 탈퇴 시 기록 (빌드 이력은 유지)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (project_id, repo_id)                -- 같은 저장소를 한 프로젝트에 두 번 연결하지 않음
);
create index project_repositories_repo_idx on public.project_repositories (repo_id) where disconnected_at is null;

-- 성공한 빌드만. 빌드 1건 = artifact 1개 또는 release asset 1개.
create table public.builds (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects (id) on delete cascade,
  repository_id      uuid not null references public.project_repositories (id) on delete cascade,
  source             text not null check (source in ('artifact', 'release')),
  name               text not null,           -- artifact 이름 또는 asset 파일명
  version_label      text not null,           -- '#4' (run_number) 또는 release tag 'v0.3.0'
  branch             text,
  commit_sha         text,
  commit_message     text,
  actor_login        text,                    -- push한 GitHub 사용자
  size_bytes         bigint,
  github_run_id      bigint,
  github_artifact_id bigint,
  github_release_id  bigint,
  github_asset_id    bigint,
  html_url           text not null,           -- GitHub에서 보기 링크
  expires_at         timestamptz,             -- artifact 보관 만료일
  expired_at         timestamptz,             -- 다운로드 시 410 받으면 기록
  created_at         timestamptz not null default now(),
  check (num_nonnulls(github_artifact_id, github_asset_id) = 1)
);
-- webhook 재전송에도 중복 생성되지 않게 (멱등성)
create unique index builds_artifact_uniq on public.builds (repository_id, github_artifact_id) where github_artifact_id is not null;
create unique index builds_asset_uniq    on public.builds (repository_id, github_asset_id)    where github_asset_id is not null;
create index builds_project_created_idx on public.builds (project_id, created_at desc);

-- 빌드 ↔ 태스크 / 스프린트 연결 (다대다). 한 행은 태스크 또는 스프린트 중 하나만 가리킨다.
create table public.build_links (
  id          uuid primary key default gen_random_uuid(),
  build_id    uuid not null references public.builds (id) on delete cascade,
  task_id     uuid references public.tasks (id) on delete cascade,
  sprint_id   uuid references public.sprints (id) on delete cascade,
  linked_by   uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  check (num_nonnulls(task_id, sprint_id) = 1)
);
create unique index build_links_task_uniq   on public.build_links (build_id, task_id)   where task_id is not null;
create unique index build_links_sprint_uniq on public.build_links (build_id, sprint_id) where sprint_id is not null;
create index build_links_task_idx   on public.build_links (task_id);
create index build_links_sprint_idx on public.build_links (sprint_id);
```

- `build_links`는 RLS가 교차 검증을 못 하므로, 빌드와 태스크/스프린트가 **같은 프로젝트인지 확인하는 트리거**를 둔다 (`ensure_task_sprint_same_project`와 같은 방식).
- 연결자가 프로젝트에서 빠지면(`project_members` delete) 그 사람의 연결에 `disconnected_at`을 기록하는 트리거. 남은 팀원에게 그 사람의 저장소 빌드가 계속 공개되지 않게 한다. 이미 받은 빌드 이력은 남기되 다운로드는 막는다(§4.5).

### 3.1 RLS

| 테이블 | select | insert | update / delete |
|---|---|---|---|
| `github_installations` | 연결된 프로젝트의 멤버 | service_role (setup 라우트) | service_role (webhook) |
| `project_repositories` | `is_project_member(project_id)` | service_role (연결 server action이 검증 후) | **연결한 본인** 또는 프로젝트 owner |
| `builds` | `is_project_member(project_id)` | service_role (webhook) | delete만: 연결한 본인 또는 owner |
| `build_links` | 빌드의 프로젝트 멤버 | 빌드의 프로젝트 멤버 (`linked_by = auth.uid()`) | delete: 프로젝트 멤버 |

- 게스트(익명 사용자)는 `project_repositories` 관련 action에서 서버가 차단한다. `build_links`는 게스트 샌드박스에서도 동작해도 무방하다(연결할 빌드가 없음).
- `builds`, `build_links`는 realtime publication에 추가 → 새로고침 없이 갱신 (기존 `tasks_realtime` 방식).
- `purge_stale_guests`는 cascade로 함께 정리되므로 수정 불필요.

### 3.2 알림

`notifications_kind_check`에 `'build_ready'` 추가, `notifications.build_id uuid references builds on delete cascade` 컬럼 추가.
- 대상: 프로젝트 멤버 전원, 단 저장소를 연결한 본인은 제외.
- 빌드가 태스크에 연결되면 그 태스크 담당자에게 `'build_linked'` 알림 ("내 작업이 들어간 빌드가 연결됨"). 연결한 본인은 제외.
- 기존 `muted_kinds` / `email_muted_kinds` 설정을 따름 → 알림 설정 화면에 두 항목 추가.

## 4. 서버 흐름

### 4.1 연결 시작 — server action `startGitHubConnect(projectId)`

1. 현재 사용자가 프로젝트 **멤버**이고 **익명(게스트)이 아닌지** 확인.
2. `state = 랜덤 nonce` 생성 → `httpOnly` 쿠키에 `{nonce, projectId}` 저장(10분).
3. 이미 이 사용자가 설치한 GitHub 계정이 있으면 설치 단계를 건너뛰고 저장소 선택 모달로 바로 간다. 없으면 `https://github.com/apps/<slug>/installations/new?state=<nonce>`로 이동.

### 4.2 설치 완료 콜백 — `GET /api/github/setup?installation_id&setup_action&code&state`

1. 쿠키의 nonce와 `state` 비교 → 불일치면 거부.
2. `code`를 사용자 토큰으로 교환 → `GET /user/installations`로 **이 사용자가 해당 `installation_id`에 실제로 접근 가능한지 검증**.
   (검증하지 않으면 남의 installation_id를 URL에 넣어 남의 저장소 빌드를 가져갈 수 있다. 멤버 누구나 연결할 수 있으므로 이 검증이 핵심이다.) 사용자 토큰은 검증 후 버린다.
3. `github_installations` upsert (`installed_by` = 현재 사용자).
4. `/builds?project=<id>&connect=<installation_id>`로 리다이렉트 (`?project=`는 기존 `project-from-url.tsx`가 활성 프로젝트로 전환) → 저장소 선택 모달이 열린다.

### 4.3 저장소 선택 — server action `linkRepository(projectId, installationId, repoId, options)`

1. 멤버·비게스트 재확인, 해당 설치가 **이 사용자가 검증을 통과한 설치**(`installed_by = auth.uid()`)인지 확인.
2. 설치 토큰으로 `GET /installation/repositories` → 선택한 `repoId`가 목록에 있는지 확인.
3. 이미 다른 멤버가 같은 저장소를 이 프로젝트에 연결했다면 "이미 연결된 저장소입니다 (연결: ○○○)"로 안내하고 중단.
4. 저장소의 워크플로 목록(`GET /repos/{o}/{r}/actions/workflows`)을 화면에 보여 주고 `workflow_path`·`branch_filter`·`build_source` 선택.
5. `project_repositories` insert. **최근 성공 실행 1건을 즉시 가져와** 빈 목록이 아니게 한다.

### 4.4 Webhook — `POST /api/github/webhook` (`runtime = "nodejs"`)

1. 원문 body로 `X-Hub-Signature-256` HMAC 검증 (`timingSafeEqual`). 실패 → 401.
2. 이벤트별 처리 (service_role 클라이언트):

| 이벤트 | 처리 |
|---|---|
| `workflow_run` (`action=completed`) | **`conclusion !== "success"`면 즉시 200으로 무시.** 성공이면 `repo_id`로 활성 연결 조회 → `workflow_path`·`branch_filter` 필터 → `GET /repos/{o}/{r}/actions/runs/{id}/artifacts`로 artifact마다 `builds` upsert → 알림. artifact가 0개면 아무것도 만들지 않음 |
| `release` (`action=published`) | `build_source in ('release','both')`인 연결에 asset마다 `builds` upsert → 알림. asset이 0개면 무시 |
| `installation` (`deleted`/`suspend`/`unsuspend`) | `github_installations` 갱신, 연결의 `disconnected_at` 설정/해제 |
| `installation_repositories` (`removed`) | 해당 `repo_id` 연결에 `disconnected_at` |
| `repository` (`renamed`/`transferred`) | `repo_full_name` 갱신 |

3. 10초 안에 200 응답 (GitHub 타임아웃). artifact 조회 1회라 Vercel 함수 안에서 충분.
4. 처리할 연결이 없으면 200으로 무시.

### 4.5 다운로드 — `GET /api/builds/[id]/download`

1. 일반 서버 클라이언트(RLS)로 `builds` 행 조회 → 안 보이면 404 (= 멤버 아님).
2. 연결이 끊긴 빌드(`project_repositories.disconnected_at` 있음)면 "저장소 연결이 해제되어 다운로드할 수 없습니다" 응답.
3. 설치 토큰 발급(모듈 메모리에 만료 5분 전까지 캐시).
4. artifact: `GET /repos/{o}/{r}/actions/artifacts/{id}/zip`, release asset: `GET /repos/{o}/{r}/releases/assets/{id}` + `Accept: application/octet-stream`, 둘 다 `redirect: "manual"`.
5. GitHub이 돌려준 `Location`(수 분짜리 서명 URL)으로 **302 리다이렉트**. 파일은 Vercel을 거치지 않는다.
6. GitHub이 410/404 → `expired_at` 기록 후 "보관 기간이 지난 빌드입니다" 응답.

### 4.6 태스크·스프린트 연결 — 클라이언트 repository 함수

- `linkBuild(buildId, { taskId } | { sprintId })`, `unlinkBuild(linkId)` — RLS 안에서 일반 클라이언트로 insert/delete.
- `listBuildsForTask(taskId)`, `listBuildsForSprint(sprintId)`, `listLinksForBuild(buildId)`.

### 4.7 모듈 구성

```
lib/github/
  app-auth.ts        JWT 생성, 설치 토큰 발급/캐시
  api.ts             fetch 래퍼 (Accept/버전 헤더, 에러 매핑)
  webhook.ts         서명 검증, 이벤트 → builds 변환 (순수 함수, 테스트 대상)
lib/supabase/repositories/
  repositories.ts    project_repositories 조회/설정/해제
  builds.ts          builds 조회, build_links CRUD
app/api/github/setup/route.ts
app/api/github/webhook/route.ts
app/api/builds/[id]/download/route.ts
```

## 5. 화면

### 5.1 빌드 페이지 (`app/(app)/builds/page.tsx`, 사이드바 `nav-items.ts`에 추가)

- **연결 없음**: 빈 상태 + "GitHub 저장소 연결" 버튼(멤버 누구나), 한 줄 설명
  "push할 때마다 성공한 CI 빌드가 여기에 자동으로 올라옵니다."
- **게스트**: 버튼 비활성 + "게스트 모드에서는 GitHub을 연결할 수 없습니다."
- **연결됨**: 상단에 연결된 저장소 칩(여러 개면 필터 역할, 칩에 연결한 사람 아바타) + "저장소 추가" 버튼.
  칩 메뉴: 설정 변경·연결 해제 — 연결한 본인과 owner에게만 표시.
- **목록 행**: `version_label` · 커밋 메시지 · 브랜치 · actor · 크기 · 상대 시각 · 연결된 태스크/스프린트 칩 · [다운로드] [GitHub] [연결 +]
  만료되었거나 연결이 해제된 빌드는 흐리게 + 다운로드 비활성.
- **필터**: 저장소, 스프린트(선택 시 그 스프린트에 연결된 빌드만).

### 5.2 저장소 연결 모달 (`ModalPortal` + `useOverlayDepth`, `SPRING.modal`)

1. 설치된 계정의 저장소 목록에서 선택 (이미 이 프로젝트에 연결된 저장소는 비활성 + 연결자 표시)
2. 워크플로 선택(기본: 전체), 브랜치(기본: 저장소 default branch), 빌드 소스(`SegmentedIndicator`: Artifact / Release / 둘 다)
3. **공개 동의 문구** (필수 체크): "이 프로젝트의 멤버 전원이 GitHub 권한 없이도 이 저장소의 빌드를 다운로드할 수 있습니다."
4. 연결 → 모달 닫힘, 첫 빌드가 들어오면 기존 리스트 진입 모션으로 표시

### 5.3 빌드 ↔ 태스크·스프린트 연결 UI

- **빌드 행의 [연결 +]**: 팝오버(`SPRING.popover`)에서 태스크 검색 / 스프린트 선택. 선택하면 행에 칩이 추가된다.
- **태스크 드로어**: "빌드" 섹션 — 연결된 빌드 목록(버전·시각·다운로드) + "빌드 연결" 버튼(같은 팝오버, 최근 빌드 순).
- **스프린트**: 스프린트 화면/헤더에 "이 스프린트 빌드 N개" 표시, 누르면 빌드 페이지를 그 스프린트로 필터해서 연다.
- 연결 해제는 칩의 ✕ (프로젝트 멤버 누구나).

### 5.4 대시보드

- 기존 `synced-assets-widget` 옆에 **"최신 빌드" 위젯**: 저장소별 마지막 빌드 1건 + 다운로드 버튼. asset_syncs 테이블과는 섞지 않는다(파일 소유 주체가 다름).

### 5.5 알림 설정

- `notification-settings.tsx`에 "새 빌드", "내 작업에 빌드 연결" 토글 2개 추가.

## 6. 보안 체크리스트

- [ ] webhook 서명 검증, 원문 body 사용 (`await req.text()` 후 파싱)
- [ ] 설치자 검증(§4.2) — installation_id 탈취 방지. 멤버 누구나 연결 가능하므로 필수
- [ ] 저장소 연결 시 `installed_by = 현재 사용자` 확인 — 다른 멤버의 설치를 빌려 쓰지 못하게
- [ ] `state` nonce 쿠키로 CSRF 방지
- [ ] 게스트(익명) 차단 — 서버에서 재확인
- [ ] 설정 변경/해제는 연결한 본인 또는 owner만 (RLS + 서버)
- [ ] 연결자가 프로젝트를 떠나면 연결 자동 해제
- [ ] 다운로드는 RLS로 멤버 확인 후에만 서명 URL 발급, URL은 DB에 저장하지 않음
- [ ] `build_links` 같은 프로젝트 검증 트리거
- [ ] 개인키·시크릿은 서버 전용 env (`NEXT_PUBLIC_` 금지)
- [ ] 사용자 OAuth 토큰은 검증 직후 폐기, 저장하지 않음

## 7. 사용자에게 안내할 GitHub 측 제약

- Actions artifact는 기본 90일 보관, 무료 플랜 private 저장소는 artifact 저장 용량 한도(약 500MB)가 있다.
  → 연결 모달/도움말에 워크플로 `retention-days: 14` 예시를 안내.
- artifact는 항상 zip으로 내려받아진다. 단일 실행 파일로 주고 싶으면 Release 사용 권장.
- Actions 실행 시간·용량은 **연결한 사람의 GitHub 계정 한도**에서 소모된다 (SquadDesk 비용 아님).

## 8. 구현 단계

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| 0 | GitHub App 등록 + env 설정 (**사용자 직접**) | Vercel에 env 등록 |
| 1 | 마이그레이션 31 (테이블 4개·RLS·트리거·realtime·알림 kind) + `schema.ts` 타입 | 원격 적용, `npm run build` 통과 |
| 2 | `lib/github/*` (JWT, 설치 토큰, API, 서명 검증) | 로컬에서 설치 토큰 발급 확인 |
| 3 | setup 라우트 + 연결 server action + 연결 모달 | DarkProject 연결 성공 |
| 4 | webhook 라우트 + 빌드 생성 + `build_ready` 알림 | DarkProject push → 성공 빌드 자동 등록, 실패 실행은 무시 |
| 5 | 다운로드 라우트 + 빌드 페이지 목록 | GitHub 권한 없는 계정으로 zip 다운로드 |
| 6 | 빌드 ↔ 태스크·스프린트 연결 (팝오버, 태스크 드로어 섹션, 스프린트 필터, `build_linked` 알림) | 태스크 드로어에서 연결된 빌드 다운로드 |
| 7 | 대시보드 위젯, 알림 설정 토글, 연결 설정 변경/해제 | — |

검증용 시나리오: DarkProject(private, `main` push → `DarkProject-Windows` artifact 약 38MB)를 첫 연결 대상으로 사용.
