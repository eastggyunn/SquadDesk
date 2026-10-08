-- list_project_members가 `returns table(..., role text, ...)`로 role을 반환 컬럼으로 선언하면
-- PL/pgSQL이 role을 함수 스코프의 암묵적 변수로도 만든다. 기존 정의는 이 role과
-- project_members.role을 구분하지 않고 그냥 `role`로만 참조해 42702(column reference "role"
-- is ambiguous)를 던졌다 — 멤버 관리 화면에서 멤버 목록을 아예 불러오지 못하던 원인.
-- project_id/user_id도 함께 별칭으로 한정해 같은 종류의 모호성을 미리 막는다.
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
  select pm.role into v_caller_role
  from public.project_members pm
  where pm.project_id = p_project_id and pm.user_id = auth.uid();

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
