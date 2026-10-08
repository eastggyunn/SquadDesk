-- ============================================================
-- 보관 프로젝트 하드닝 — 영구 삭제 차단 · 멤버/초대 잠금 · 복원 직렬화
--
-- 10단계(00000000000017)는 업무 데이터(작업·버그·채널·메시지·첨부·에셋)와
-- Storage의 쓰기만 is_project_writable()로 막았다. 그런데 그 위층이 아직 열려
-- 있었다:
--   - projects_delete_owner가 남아 있어 클라이언트가 테이블을 직접 DELETE하면
--     프로젝트가 통째로 지워지고 on delete cascade로 멤버십·업무 데이터까지
--     따라 사라진다. 이 설계는 영구 삭제를 지원하지 않으므로 정책 자체를 없앤다.
--   - projects_update_owner가 보관 여부를 보지 않아 보관된 프로젝트의 이름을
--     직접 UPDATE할 수 있었다. rename_project()는 SECURITY DEFINER라 RLS를
--     지나치므로 함수 안에서도 따로 막는다.
--   - project_members와 초대 RPC가 보관 여부를 보지 않아, 보관된 프로젝트에
--     멤버를 넣고 빼고 초대를 만들고 수락할 수 있었다.
--
-- 원칙은 17번과 같다: 읽기는 그대로 열어 두고(보관 데이터는 계속 조회된다)
-- 상태를 바꾸는 경로만 "활성 프로젝트"로 좁힌다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. "활성 프로젝트인가" 단일 판정
--    17번의 is_project_writable()이 인라인으로 갖고 있던 조건을 함수로 빼서
--    아래 정책·RPC가 전부 같은 정의를 참조하게 한다.
-- ------------------------------------------------------------

create or replace function public.is_project_active(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.archived_at is null
  );
$$;

comment on function public.is_project_active is
  '보관되지 않은 프로젝트인지. 멤버십·초대·프로젝트 자체의 쓰기 정책이 모두 이 판정을 공유한다.';

create or replace function public.is_project_writable(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_project_member(p_project_id) and public.is_project_active(p_project_id);
$$;

-- ------------------------------------------------------------
-- 2. 프로젝트 영구 삭제 차단
--
--    DELETE 정책을 없애면 RLS의 기본값(정책 없음 = 거부)이 적용되어 어떤
--    authenticated 사용자도 projects를 지울 수 없다. 보관이 유일한 "치우는"
--    경로이고, 되돌리는 경로는 restore_project()다.
-- ------------------------------------------------------------

drop policy projects_delete_owner on public.projects;

-- 보관된 프로젝트는 이름도 못 바꾼다. archived_at을 컬럼으로 직접 보므로
-- USING은 갱신 전 행을, WITH CHECK는 갱신 후 행을 판정한다 — 즉 직접 UPDATE로
-- 보관하거나 복원할 수도 없다(그 경로는 archive/restore RPC뿐이다).
drop policy projects_update_owner on public.projects;

create policy projects_update_owner on public.projects
  for update to authenticated
  using (public.is_project_owner(id) and archived_at is null)
  with check (public.is_project_owner(id) and archived_at is null);

-- ------------------------------------------------------------
-- 3. 멤버십 변경은 활성 프로젝트에서만 (SELECT는 그대로)
--
--    마지막 owner 보호 트리거(prevent_last_owner_removal)는 그대로 둔다.
-- ------------------------------------------------------------

drop policy project_members_insert_owner on public.project_members;
drop policy project_members_update_owner on public.project_members;
drop policy project_members_delete_owner on public.project_members;

create policy project_members_insert_owner on public.project_members
  for insert to authenticated
  with check (public.is_project_owner(project_id) and public.is_project_active(project_id));

create policy project_members_update_owner on public.project_members
  for update to authenticated
  using (public.is_project_owner(project_id) and public.is_project_active(project_id))
  with check (public.is_project_owner(project_id) and public.is_project_active(project_id));

create policy project_members_delete_owner on public.project_members
  for delete to authenticated
  using (public.is_project_owner(project_id) and public.is_project_active(project_id));

-- ------------------------------------------------------------
-- 4. 이름 변경 — 보관된 프로젝트는 거부 (00000000000016의 함수를 대체)
--
--    SECURITY DEFINER 함수는 RLS를 지나치므로 위 정책만으로는 부족하다.
--    거부 사유를 한국어로 돌려주고 복원 경로를 안내한다.
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

  if not public.is_project_active(p_project_id) then
    raise exception '보관된 프로젝트의 이름은 변경할 수 없습니다. 먼저 복원한 뒤 다시 시도해주세요.';
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
  'owner만 활성 프로젝트의 이름을 바꾼다. 보관된 프로젝트는 복원 후에만 변경할 수 있다.';

-- ------------------------------------------------------------
-- 5. 복원 — 이름 검사 직렬화 (00000000000017의 함수를 대체)
--
--    create_project()/이름 트리거와 같은 잠금(호출자의 users 행)을 잡는다.
--    그러지 않으면 같은 이름으로 "생성"과 "복원"이 동시에 들어올 때 둘 다
--    중복 없음을 보고 통과해 활성 프로젝트 이름이 겹칠 수 있다(READ COMMITTED).
-- ------------------------------------------------------------

create or replace function public.restore_project(p_project_id uuid)
returns setof public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not public.is_project_owner(p_project_id) then
    raise exception '프로젝트 owner만 보관된 프로젝트를 복원할 수 있습니다.';
  end if;

  select * into v_project from public.projects where id = p_project_id;

  if v_project.archived_at is null then
    return next v_project;
    return;
  end if;

  -- 이름 검사를 이 사용자에 대해 직렬화한다. create_project()와
  -- enforce_project_name_unique_for_actor()가 잡는 것과 같은 행이다.
  perform 1 from public.users where id = auth.uid() for update;

  -- 보관해 둔 사이에 같은 이름의 활성 프로젝트가 생겼을 수 있다. 이름 트리거는
  -- 이름이 바뀔 때만 돌므로 archived_at만 되돌리는 이 경로에서 직접 확인한다.
  if exists (
    select 1
    from public.project_members pm
    join public.projects p on p.id = pm.project_id
    where pm.user_id = auth.uid()
      and p.id <> p_project_id
      and p.archived_at is null
      and public.normalize_project_name(p.name) = public.normalize_project_name(v_project.name)
  ) then
    raise exception '이미 같은 이름의 활성 프로젝트가 있습니다. 기존 프로젝트의 이름을 바꾼 뒤 다시 복원해주세요.';
  end if;

  update public.projects
  set archived_at = null
  where id = p_project_id
  returning * into v_project;

  return next v_project;
end;
$$;

comment on function public.restore_project is
  'owner만 보관된 프로젝트를 다시 활성으로 되돌린다. 이름 중복 검사는 호출자 행을 잠가 생성/이름 변경과 직렬화된다.';

-- ------------------------------------------------------------
-- 6. 초대 — 보관된 프로젝트에서는 만들 수도, 취소할 수도, 수락할 수도 없다
--    (00000000000012의 함수들을 대체한다)
--
--    수락 차단은 invitation_status() 사다리에 'archived' 한 칸을 더하는 것으로
--    끝난다 — 조회(get)와 수락(accept)이 같은 판정을 공유하기 때문이다.
--    email_mismatch 뒤에 두어, 초대 대상이 아닌 사람에게는 프로젝트의 보관
--    여부조차 알려주지 않는다.
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
    when not public.is_project_active(p_inv.project_id) then 'archived'
    else 'ok'
  end;
$$;

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

  if not public.is_project_active(p_project_id) then
    raise exception '보관된 프로젝트에는 멤버를 초대할 수 없습니다. 먼저 복원한 뒤 다시 시도해주세요.';
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

  if not public.is_project_active(v_project_id) then
    raise exception '보관된 프로젝트의 초대는 변경할 수 없습니다. 먼저 복원한 뒤 다시 시도해주세요.';
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
-- 7. 실행 권한
-- ------------------------------------------------------------

revoke all on function public.is_project_active(uuid) from public, anon;
grant execute on function public.is_project_active(uuid) to authenticated;
