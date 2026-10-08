-- ============================================================
-- Align frontend <-> DB terminology (lib/types.ts 기준으로 통일)
-- ============================================================

-- 버그 심각도: 프론트엔드는 'Blocker'를 표준으로 사용한다 (BugSeverity).
alter type public.bug_severity rename value 'Critical' to 'Blocker';

-- 버그 발생 위치: 프론트엔드 Bug.location에 대응 (기존 symptom 컬럼을 재사용).
alter table public.bugs rename column symptom to location;

-- 팀원 직군: 프론트엔드 목업/화면에서 실제 사용하는 표기는 'Designer'.
alter type public.job_role rename value 'Game Designer' to 'Designer';

-- 작업 우선순위: 프론트엔드 Task.priority(High | Medium | Low)에 대응하는 컬럼이 없었다.
create type public.task_priority as enum ('High', 'Medium', 'Low');

alter table public.tasks
  add column priority   public.task_priority not null default 'Medium',
  add column start_date date,
  add column domain_id  uuid references public.work_domains (id) on delete set null;

comment on column public.tasks.domain_id is
  '업무 영역 참조. 업무 영역이 삭제되면 NULL로 설정되어 작업은 삭제되지 않고 미분류 상태로 남는다.';

-- figma_link / spine_file_path는 범용 attachments 테이블(다음 마이그레이션)로 대체된다.
-- 어떤 화면 코드도 이 두 컬럼을 참조하지 않으므로(프론트엔드는 attachments[] 배열만 사용)
-- 안전하게 제거하고, 실제 파일 메타데이터는 target_type='task'인 attachments 행으로 옮긴다.
alter table public.tasks
  drop column figma_link,
  drop column spine_file_path;

-- 프로젝트 소속: 기존 행은 부트스트랩 기본 프로젝트로 소급 연결한 뒤,
-- 이후 신규 행은 반드시 명시적으로 project_id를 지정하도록 기본값을 제거한다.
alter table public.tasks
  add column project_id uuid not null references public.projects (id) on delete cascade
    default '00000000-0000-0000-0000-000000000001';
alter table public.tasks alter column project_id drop default;

alter table public.bugs
  add column project_id uuid not null references public.projects (id) on delete cascade
    default '00000000-0000-0000-0000-000000000001';
alter table public.bugs alter column project_id drop default;

create index tasks_project_id_idx on public.tasks (project_id);
create index tasks_domain_id_idx on public.tasks (domain_id);
create index tasks_priority_idx on public.tasks (priority);
create index bugs_project_id_idx on public.bugs (project_id);
