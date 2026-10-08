-- ============================================================
-- 프로젝트 초대 & 멤버 관리
--
-- 지금까지 프로젝트 멤버십은 SQL Editor에서 직접 INSERT하는 수밖에 없었다
-- (README "개발자가 SQL로 초기 팀/프로젝트/멤버십을 부여하는 방법").
-- 이 마이그레이션은 owner가 UI에서 팀원을 초대·관리할 수 있게 만든다.
--
-- 설계 결정
-- 1) 이메일 발송/Admin API/service_role을 쓰지 않는다. 대신 owner가 직접
--    전달하는 "초대 링크"를 만든다. 링크의 토큰은 256비트 난수이고,
--    DB에는 원문이 아니라 sha256 해시만 저장한다 — DB 덤프가 유출돼도
--    그 자체로는 수락에 쓸 수 없다. 원문 토큰은 생성 시 딱 한 번
--    호출자(owner)에게 반환된다.
-- 2) 검증(만료/상태/이메일 일치/최소 owner 1명)은 UI가 아니라 이 파일의
--    제약조건·트리거·SECURITY DEFINER 함수에서 강제한다.
-- 3) project_invitations의 직접 SELECT는 해당 프로젝트 owner에게만 열고,
--    초대 대상자는 토큰을 아는 경우에만 SECURITY DEFINER 함수를 통해
--    자기 초대의 최소 정보만 조회한다. 멤버/제3자는 다른 사람의 초대
--    이메일이나 토큰 해시를 볼 수 없다.
--
-- 사용자 Auth 이메일 변경 / 프로필 비활성화 처리
-- - 초대는 생성 시점의 이메일 문자열에 고정된다. 수락 전에 대상자가 Auth
--   이메일을 바꾸면 그 초대는 더 이상 수락할 수 없다(email_mismatch).
--   owner가 새 이메일로 다시 초대해야 한다 — 이는 의도된 동작으로,
--   초대를 "이 주소를 통제하는 사람"에게 묶어두기 위함이다.
-- - public.users.deactivated_at(비활성화)은 멤버십과 독립이다. 비활성 사용자도
--   기술적으로는 초대를 수락할 수 있으나, 표준 경로는 owner가 멤버 목록에서
--   제거하는 것이다. 멤버 목록은 deactivated_at을 함께 반환해 UI가 표시한다.
-- ============================================================

-- pgcrypto(gen_random_bytes/digest)는 00000000000001_init_schema.sql이 이미
-- 스키마 지정 없이 설치한다. 여기서 `with schema extensions`를 다시 선언하면
-- 이미 설치된 확장을 옮기지 않고 조용히 no-op이 되어 스키마 한정 호출이 깨진다.
-- 대신 아래 함수들의 search_path에 extensions를 함께 넣어, Supabase(확장이
-- extensions 스키마에 있음)와 순수 Postgres(public에 있음) 양쪽에서 찾히게 한다.
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. 최소 owner 1명 보장 (DB 레벨)
-- ------------------------------------------------------------

create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- owner였던 행을 강등/삭제하는 경우에만 검사하면 된다.
  -- (DELETE에서는 new가 null이므로 반환값은 coalesce(new, old)로 통일한다)
  if old.role <> 'owner' or (tg_op = 'UPDATE' and new.role = 'owner') then
    return coalesce(new, old);
  end if;

  -- 프로젝트 행을 잠가 같은 프로젝트의 멤버 변경을 직렬화한다. 이게 없으면
  -- 두 owner를 동시에 강등할 때 서로의 미커밋 변경을 보지 못해 둘 다 통과하고
  -- owner가 0명인 프로젝트가 만들어질 수 있다(READ COMMITTED).
  perform 1 from public.projects where id = old.project_id for update;

  if not exists (
    select 1 from public.project_members
    where project_id = old.project_id
      and role = 'owner'
      and user_id <> old.user_id
  ) then
    raise exception '프로젝트에는 최소 한 명의 owner가 있어야 합니다.';
  end if;

  return coalesce(new, old);
end;
$$;

comment on function public.prevent_last_owner_removal is
  '마지막 owner의 역할 강등/제거를 막는다. UI 검증과 무관하게 DB에서 항상 보장된다.';

create trigger prevent_last_owner_removal
  before update or delete on public.project_members
  for each row execute function public.prevent_last_owner_removal();

-- ------------------------------------------------------------
-- 2. 초대 테이블
-- ------------------------------------------------------------

create table public.project_invitations (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  email        text not null check (position('@' in email) > 1),
  role         text not null default 'member' check (role in ('owner', 'member')),
  token_hash   text not null unique,
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  expires_at   timestamptz not null,
  invited_by   uuid references public.users (id) on delete set null,
  accepted_by  uuid references public.users (id) on delete set null,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- 수락된 초대는 반드시 수락자/수락시각을 가진다 (이력 보존).
  constraint project_invitations_accepted_fields
    check (status <> 'accepted' or (accepted_by is not null and accepted_at is not null))
);

comment on table public.project_invitations is
  '프로젝트 초대. token_hash는 초대 링크 토큰의 sha256 해시이며 원문 토큰은 저장하지 않는다.';
comment on column public.project_invitations.email is
  '초대 대상 이메일(소문자 정규화 저장). 수락 시 로그인 계정의 auth 이메일과 일치해야 한다.';
comment on column public.project_invitations.token_hash is
  '초대 토큰의 sha256 hex 해시. 원문 토큰은 생성 시 1회만 owner에게 반환된다.';

-- 같은 프로젝트에 같은 이메일의 "대기 중" 초대가 중복 생성되지 않도록 막는다.
-- 취소/수락된 초대는 이력으로 남으므로 부분 인덱스를 쓴다.
create unique index project_invitations_pending_email_idx
  on public.project_invitations (project_id, email)
  where status = 'pending';

-- list_project_invitations가 project_id로 걸러 created_at desc로 정렬하므로
-- 정렬까지 인덱스로 덮는다. email 단독 조회 경로는 없어 별도 인덱스를 두지 않는다.
create index project_invitations_project_created_idx
  on public.project_invitations (project_id, created_at desc);

create trigger set_updated_at before update on public.project_invitations
  for each row execute function public.set_updated_at();

alter table public.project_invitations enable row level security;

-- 직접 SELECT는 해당 프로젝트 owner만. INSERT/UPDATE/DELETE 정책은 두지 않는다 —
-- 모든 쓰기는 아래 SECURITY DEFINER 함수를 통해서만 일어난다.
create policy project_invitations_select_owner on public.project_invitations
  for select to authenticated
  using (public.is_project_owner(project_id));

-- ------------------------------------------------------------
-- 3. 헬퍼
-- ------------------------------------------------------------

create or replace function public.current_auth_email()
returns text
language sql
security definer
set search_path = public, auth
stable
as $$
  select lower(u.email) from auth.users u where u.id = auth.uid();
$$;

comment on function public.current_auth_email is
  '로그인 사용자의 auth 이메일(소문자). 초대 수락 시 대상 이메일 일치 검증에 쓴다.';

create or replace function public.hash_invitation_token(p_token text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(digest(p_token, 'sha256'), 'hex');
$$;

-- ------------------------------------------------------------
-- 4. 멤버 목록 조회
--    프로젝트 멤버면 호출할 수 있지만, 이메일은 owner에게만 반환한다.
--    (멤버 화면은 owner 전용이고, member에게는 읽기 전용 안내를 보여준다)
-- ------------------------------------------------------------

create or replace function public.list_project_members(p_project_id uuid)
returns table (
  user_id uuid,
  name text,
  email text,
  role text,
  joined_at timestamptz,
  deactivated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
stable
as $$
declare
  v_caller_role text;
begin
  -- 멤버십과 owner 여부를 한 번의 조회로 함께 얻는다
  -- (is_project_member + is_project_owner는 같은 행을 두 번 읽는다).
  select role into v_caller_role
  from public.project_members
  where project_id = p_project_id and user_id = auth.uid();

  if v_caller_role is null then
    raise exception '이 프로젝트의 멤버만 조회할 수 있습니다.';
  end if;

  return query
  select
    u.id,
    u.name,
    case when v_caller_role = 'owner' then au.email::text else null end,
    pm.role,
    pm.joined_at,
    u.deactivated_at
  from public.project_members pm
  join public.users u on u.id = pm.user_id
  left join auth.users au on au.id = pm.user_id
  where pm.project_id = p_project_id
  order by (pm.role = 'owner') desc, u.name;
end;
$$;

-- ------------------------------------------------------------
-- 5. 초대 목록 (owner 전용, token_hash는 반환하지 않는다)
-- ------------------------------------------------------------

create or replace function public.list_project_invitations(p_project_id uuid)
returns table (
  id uuid,
  email text,
  role text,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  accepted_at timestamptz,
  invited_by_name text,
  accepted_by_name text,
  is_expired boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_project_owner(p_project_id) then
    raise exception '프로젝트 owner만 초대 목록을 볼 수 있습니다.';
  end if;

  return query
  select
    i.id,
    i.email,
    i.role,
    i.status,
    i.expires_at,
    i.created_at,
    i.accepted_at,
    inviter.name,
    acceptor.name,
    (i.status = 'pending' and i.expires_at <= now())
  from public.project_invitations i
  left join public.users inviter on inviter.id = i.invited_by
  left join public.users acceptor on acceptor.id = i.accepted_by
  where i.project_id = p_project_id
  order by i.created_at desc;
end;
$$;

-- ------------------------------------------------------------
-- 6. 초대 생성 (owner 전용) — 원문 토큰을 1회만 반환한다
-- ------------------------------------------------------------

create or replace function public.create_project_invitation(
  p_project_id uuid,
  p_email text,
  p_role text default 'member',
  p_expires_in_days integer default 7
)
returns text
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_email text := lower(trim(p_email));
  v_token text;
begin
  if not public.is_project_owner(p_project_id) then
    raise exception '프로젝트 owner만 초대를 만들 수 있습니다.';
  end if;

  if position('@' in v_email) < 2 then
    raise exception '올바른 이메일 주소를 입력해주세요.';
  end if;

  if p_role not in ('owner', 'member') then
    raise exception '역할은 owner 또는 member만 가능합니다.';
  end if;

  if p_expires_in_days < 1 or p_expires_in_days > 30 then
    raise exception '초대 유효 기간은 1~30일 사이여야 합니다.';
  end if;

  -- 이미 멤버인 사람은 초대하지 않는다. (auth.users.email은 GoTrue가 소문자로
  -- 정규화해 저장하고 유니크 인덱스가 있으므로 단일 probe로 찾는다)
  if exists (
    select 1 from public.project_members
    where project_id = p_project_id
      and user_id = (select id from auth.users where email = v_email)
  ) then
    raise exception '이미 이 프로젝트의 멤버입니다.';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');

  -- 대기 중 중복 초대는 부분 유니크 인덱스 하나로만 막는다. 사전 조회 +
  -- INSERT로 나누면 그 사이에 다른 트랜잭션이 끼어들 수 있어(TOCTOU), 제약
  -- 위반을 잡아 한국어 메시지로 바꾸는 쪽이 검증 지점도 하나로 유지된다.
  begin
    insert into public.project_invitations (project_id, email, role, token_hash, expires_at, invited_by)
    values (
      p_project_id,
      v_email,
      p_role,
      public.hash_invitation_token(v_token),
      now() + make_interval(days => p_expires_in_days),
      auth.uid()
    );
  exception when unique_violation then
    raise exception '이미 대기 중인 초대가 있습니다. 기존 초대를 취소한 뒤 다시 시도해주세요.';
  end;

  return v_token;
end;
$$;

comment on function public.create_project_invitation is
  '초대를 만들고 원문 토큰을 1회 반환한다. DB에는 해시만 남으므로 이후 원문을 다시 조회할 수 없다 — 링크를 잃으면 취소 후 재발급한다.';

-- ------------------------------------------------------------
-- 7. 초대 취소 (owner 전용)
-- ------------------------------------------------------------

create or replace function public.revoke_project_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_status text;
begin
  select project_id, status into v_project_id, v_status
  from public.project_invitations
  where id = p_invitation_id;

  if v_project_id is null then
    raise exception '초대를 찾을 수 없습니다.';
  end if;

  if not public.is_project_owner(v_project_id) then
    raise exception '프로젝트 owner만 초대를 취소할 수 있습니다.';
  end if;

  if v_status <> 'pending' then
    raise exception '이미 수락되었거나 취소된 초대입니다.';
  end if;

  update public.project_invitations
  set status = 'revoked'
  where id = p_invitation_id;
end;
$$;

-- ------------------------------------------------------------
-- 8. 초대 조회 / 수락 (토큰 소지자)
--
--    상태 코드: ok | not_found | expired | revoked | accepted
--               | email_mismatch | already_member
--    상태 판정 순서는 invitation_status() 한 곳에만 둔다 — 조회(get)와
--    수락(accept)이 각자 같은 사다리를 다시 쓰면 조용히 어긋난다.
--    초대 대상 이메일 원문은 어느 쪽에서도 반환하지 않는다(불일치 시에는
--    "다른 계정으로 로그인해야 한다"는 사실만 알 수 있으면 충분하다).
-- ------------------------------------------------------------

create or replace function public.invitation_status(
  p_inv public.project_invitations,
  p_email text
)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select case
    when p_inv.status = 'revoked' then 'revoked'
    when p_inv.status = 'accepted' then 'accepted'
    when p_inv.expires_at <= now() then 'expired'
    when p_inv.email <> p_email then 'email_mismatch'
    when public.is_project_member(p_inv.project_id) then 'already_member'
    else 'ok'
  end;
$$;

create or replace function public.get_project_invitation(p_token text)
returns table (
  status text,
  project_id uuid,
  project_name text,
  invited_role text
)
language plpgsql
security definer
set search_path = public, auth
stable
as $$
declare
  v_inv public.project_invitations;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into v_inv
  from public.project_invitations
  where token_hash = public.hash_invitation_token(p_token);

  if v_inv.id is null then
    return query select 'not_found'::text, null::uuid, null::text, null::text;
    return;
  end if;

  return query
  select
    public.invitation_status(v_inv, public.current_auth_email()),
    v_inv.project_id,
    p.name,
    v_inv.role
  from public.projects p
  where p.id = v_inv.project_id;
end;
$$;

create or replace function public.accept_project_invitation(p_token text)
returns table (status text, project_id uuid, project_name text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_inv public.project_invitations;
  v_status text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  -- 동시 수락 요청이 중복 멤버십/이중 수락을 만들지 않도록 행을 잠근다.
  select * into v_inv
  from public.project_invitations
  where token_hash = public.hash_invitation_token(p_token)
  for update;

  if v_inv.id is null then
    return query select 'not_found'::text, null::uuid, null::text;
    return;
  end if;

  v_status := public.invitation_status(v_inv, public.current_auth_email());

  if v_status <> 'ok' then
    -- 이메일 불일치는 프로젝트를 특정할 수 있는 정보를 돌려주지 않는다.
    if v_status = 'email_mismatch' then
      return query select v_status, null::uuid, null::text;
    else
      return query select v_status, v_inv.project_id, p.name from public.projects p where p.id = v_inv.project_id;
    end if;
    return;
  end if;

  -- 멤버십 생성과 초대 상태 전이를 같은 트랜잭션에서 처리한다.
  insert into public.project_members (project_id, user_id, role)
  values (v_inv.project_id, auth.uid(), v_inv.role)
  on conflict (project_id, user_id) do nothing;

  update public.project_invitations
  set status = 'accepted',
      accepted_by = auth.uid(),
      accepted_at = now()
  where id = v_inv.id;

  return query
  select 'ok'::text, v_inv.project_id, p.name from public.projects p where p.id = v_inv.project_id;
end;
$$;

-- ------------------------------------------------------------
-- 9. 실행 권한
--    anon(로그인 전)에게는 어떤 초대 함수도 열지 않는다 — 초대 화면은
--    로그인 후에만 접근할 수 있고, 미들웨어가 /invite를 보호한다.
-- ------------------------------------------------------------

revoke all on function public.list_project_members(uuid) from public, anon;
revoke all on function public.list_project_invitations(uuid) from public, anon;
revoke all on function public.create_project_invitation(uuid, text, text, integer) from public, anon;
revoke all on function public.revoke_project_invitation(uuid) from public, anon;
revoke all on function public.get_project_invitation(text) from public, anon;
revoke all on function public.accept_project_invitation(text) from public, anon;
revoke all on function public.current_auth_email() from public, anon;
revoke all on function public.invitation_status(public.project_invitations, text) from public, anon;

grant execute on function public.list_project_members(uuid) to authenticated;
grant execute on function public.list_project_invitations(uuid) to authenticated;
grant execute on function public.create_project_invitation(uuid, text, text, integer) to authenticated;
grant execute on function public.revoke_project_invitation(uuid) to authenticated;
grant execute on function public.get_project_invitation(text) to authenticated;
grant execute on function public.accept_project_invitation(text) to authenticated;
