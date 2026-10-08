-- ============================================================
-- 회원가입 시 public.users 프로필 자동 생성
--
-- 00000000000008_row_level_security.sql의 users_select_authenticated /
-- users_update_self 정책은 그대로 두되(1단계 설계 존중, 재구현하지 않음),
-- 지금까지 비어 있던 "auth.users insert -> public.users 행 생성" 트리거를
-- 채운다. 프로젝트/팀 멤버십은 여기서 만들지 않는다 — 로그인만 했다고
-- 프로젝트가 자동 배정되지는 않는다(README "프로젝트 접근 모델" 참고).
-- ============================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), '팀원'))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
