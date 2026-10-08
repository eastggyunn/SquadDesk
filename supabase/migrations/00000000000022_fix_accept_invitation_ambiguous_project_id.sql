-- accept_project_invitation이 `returns table (status, project_id, project_name)`로 project_id를
-- 반환 컬럼으로 선언하면 PL/pgSQL이 project_id를 함수 스코프의 암묵적 변수로도 만든다.
-- 그래서 `on conflict (project_id, user_id)`의 충돌 대상이 변수인지 컬럼인지 모호해져
-- 42702(column reference "project_id" is ambiguous)를 던졌다 — 초대 링크를 아예 수락할 수
-- 없던 원인(00000000000021과 같은 종류의 문제).
-- 충돌 대상에는 별칭을 붙일 수 없으므로, 이 함수 안에서는 이름이 겹치면 컬럼을 우선하도록 한다.
-- 본문의 변수 참조는 모두 v_ 접두사를 쓰므로 이 지시어로 의미가 바뀌는 곳은 없다.
create or replace function public.accept_project_invitation(p_token text)
returns table (status text, project_id uuid, project_name text)
language plpgsql
security definer
set search_path = public, auth
as $$
#variable_conflict use_column
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
