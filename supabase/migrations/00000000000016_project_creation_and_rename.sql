-- ============================================================
-- 프로젝트 생성 & 이름 변경 (SQL Editor 없이)
--
-- 지금까지 "최초 프로젝트와 그 첫 owner"만은 SQL Editor에서 직접 INSERT할 수밖에
-- 없었다(README "개발자가 SQL로 최초 프로젝트/owner를 만드는 방법"). 초대 기능이
-- "이미 owner가 있는 프로젝트"를 전제로 하기 때문이다. 이 마이그레이션은 로그인한
-- 사용자가 UI에서 직접 프로젝트를 만들고 그 owner가 되게 해 부트스트랩 SQL을 없앤다.
--
-- 설계 결정
-- 1) 이 스키마에서 "팀"은 별도 테이블이 아니라 projects + project_members로
--    표현된다(00000000000002_projects_and_teams.sql). 따라서 "팀 + 프로젝트 +
--    owner 멤버십"을 만드는 원자적 단위는 create_project() 함수 하나다. plpgsql
--    함수는 단일 트랜잭션에서 실행되므로 중간에 어떤 예외가 나도 projects 행만
--    남고 멤버십이 없는 부분 생성 상태는 생기지 않는다(전부 롤백).
-- 2) service_role key나 Admin API를 쓰지 않는다. 클라이언트는 authenticated
--    권한으로 RPC만 호출하고, owner 검증은 전부 이 파일의 함수·트리거·RLS가 한다.
-- 3) 이름 중복 정책: **"호출자가 속한 프로젝트들 사이에서" 이름이 겹치지 않는다.**
--    전역 유니크는 다른 팀이 이미 쓴 이름을 못 쓰게 만들고 남의 프로젝트 이름
--    존재 여부까지 흘리므로 멀티테넌트에 맞지 않는다. 사용자가 실제로 혼동하는
--    범위는 자기 사이드바 목록이고, 그 목록이 곧 project_members 기준 소속
--    프로젝트다 — UI 검증(같은 목록으로 판단)과 DB 검증의 대상이 정확히 일치한다.
--    비교는 normalize_project_name()(앞뒤 공백 제거·연속 공백 1칸·소문자)으로 한다.
-- 4) 이름은 여러 테이블에 걸친 조건이라 단일 유니크 인덱스로 표현할 수 없다.
--    대신 projects에 BEFORE INSERT/UPDATE 트리거를 걸어 DB에서 항상 강제한다 —
--    RPC를 거치지 않고 테이블을 직접 써도 동일하게 막힌다.
-- 5) 프로젝트 삭제/아카이브는 이번 단계 범위가 아니다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 이름 정규화 + 길이 제약 (UI 검증과 같은 규칙)
-- ------------------------------------------------------------

create or replace function public.normalize_project_name(p_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'));
$$;

comment on function public.normalize_project_name is
  '프로젝트 이름 비교용 정규화(앞뒤 공백 제거 · 연속 공백 1칸 · 소문자). 클라이언트 검증도 같은 규칙을 쓴다.';

-- 기존 행('Default Project')은 이 범위를 이미 만족한다.
alter table public.projects
  add constraint projects_name_length
  check (char_length(btrim(name)) between 1 and 50);

-- ------------------------------------------------------------
-- 2. "내 프로젝트 목록 안에서" 이름 중복 금지 (DB 강제)
-- ------------------------------------------------------------

create or replace function public.enforce_project_name_unique_for_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  -- 인증 컨텍스트가 없는 실행(마이그레이션/시드/SQL Editor)은 검사 대상이 아니다.
  -- handle_new_project()가 auth.uid() null을 건너뛰는 것과 같은 이유다.
  if v_actor is null then
    return new;
  end if;

  -- 이름이 실질적으로 그대로면(대소문자·공백만 다름) 검사할 필요가 없다.
  if tg_op = 'UPDATE'
     and public.normalize_project_name(new.name) = public.normalize_project_name(old.name) then
    return new;
  end if;

  -- 같은 사용자가 동시에 같은 이름을 만들면 둘 다 "없음"을 보고 통과할 수 있다
  -- (READ COMMITTED). 호출자 행을 잠가 그 사용자의 이름 검사를 직렬화한다.
  perform 1 from public.users where id = v_actor for update;

  if exists (
    select 1
    from public.project_members pm
    join public.projects p on p.id = pm.project_id
    where pm.user_id = v_actor
      and p.id <> new.id
      and public.normalize_project_name(p.name) = public.normalize_project_name(new.name)
  ) then
    raise exception '이미 같은 이름의 프로젝트가 있습니다. 다른 이름을 입력해주세요.';
  end if;

  return new;
end;
$$;

comment on function public.enforce_project_name_unique_for_actor is
  '호출자가 속한 프로젝트들 사이의 이름 중복을 막는다. RPC를 거치지 않는 직접 INSERT/UPDATE도 동일하게 막힌다.';

create trigger enforce_project_name_unique_for_actor
  before insert or update of name on public.projects
  for each row execute function public.enforce_project_name_unique_for_actor();

-- ------------------------------------------------------------
-- 3. 프로젝트 생성 (인증 사용자 전용) — 생성자가 곧 owner
--
--    projects INSERT → project_members(owner) INSERT가 한 트랜잭션이다.
--    owner 멤버십은 기존 handle_new_project 트리거도 만들지만, 이 함수가
--    트리거 존재 여부에 의존하지 않도록 명시적으로 upsert한다.
-- ------------------------------------------------------------

create or replace function public.create_project(p_name text)
returns setof public.projects
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_name    text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_base    text;
  v_slug    text;
  v_project public.projects;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if v_name = '' then
    raise exception '프로젝트 이름을 입력해주세요.';
  end if;

  if char_length(v_name) > 50 then
    raise exception '프로젝트 이름은 50자 이하로 입력해주세요.';
  end if;

  -- slug는 URL-safe 식별자일 뿐 화면에 쓰이지 않는다. 한글 등 ASCII 밖 이름은
  -- 전부 걸러져 빈 문자열이 되기 쉬우므로, 항상 난수 접미사를 붙여 전역 유니크
  -- 제약(projects.slug)을 만족시킨다.
  v_base := btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), '-');
  if v_base = '' then
    v_base := 'project';
  end if;
  v_base := left(v_base, 40);

  for i in 1..3 loop
    begin
      v_slug := v_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
      insert into public.projects (name, slug)
      values (v_name, v_slug)
      returning * into v_project;
      exit;
    exception when unique_violation then
      if i = 3 then
        raise exception '프로젝트를 만들지 못했습니다. 잠시 후 다시 시도해주세요.';
      end if;
    end;
  end loop;

  insert into public.project_members (project_id, user_id, role)
  values (v_project.id, auth.uid(), 'owner')
  on conflict (project_id, user_id) do update set role = 'owner';

  return next v_project;
end;
$$;

comment on function public.create_project is
  '프로젝트 + 생성자 owner 멤버십을 한 트랜잭션으로 만든다. 실패 시 전부 롤백되어 프로젝트만 남는 상태가 생기지 않는다.';

-- ------------------------------------------------------------
-- 4. 프로젝트 이름 변경 (owner 전용)
--
--    projects_update_owner RLS도 같은 규칙을 강제하지만, 이 RPC는 거부 사유를
--    한국어 예외로 돌려준다 — RLS의 USING은 "거부"가 아니라 "필터"라서 직접
--    UPDATE하면 0행이 조용히 갱신될 뿐이기 때문이다.
-- ------------------------------------------------------------

create or replace function public.rename_project(p_project_id uuid, p_name text)
returns setof public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name    text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_project public.projects;
begin
  if not public.is_project_owner(p_project_id) then
    raise exception '프로젝트 owner만 이름을 변경할 수 있습니다.';
  end if;

  if v_name = '' then
    raise exception '프로젝트 이름을 입력해주세요.';
  end if;

  if char_length(v_name) > 50 then
    raise exception '프로젝트 이름은 50자 이하로 입력해주세요.';
  end if;

  -- 이름 외의 컬럼은 건드리지 않는다 — 멤버십·초대 링크·첨부·업무 데이터는
  -- 전부 project_id로 연결돼 있어 이름 변경의 영향을 받지 않는다.
  update public.projects
  set name = v_name
  where id = p_project_id
  returning * into v_project;

  return next v_project;
end;
$$;

comment on function public.rename_project is
  'owner만 활성 프로젝트의 이름을 바꾼다. 멤버십·초대 링크·첨부·업무 데이터는 그대로 유지된다.';

-- ------------------------------------------------------------
-- 5. 실행 권한 — 로그인 사용자만
-- ------------------------------------------------------------

revoke all on function public.create_project(text) from public, anon;
revoke all on function public.rename_project(uuid, text) from public, anon;

grant execute on function public.create_project(text) to authenticated;
grant execute on function public.rename_project(uuid, text) to authenticated;
