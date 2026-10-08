-- ============================================================
-- Tasks realtime
--
-- 칸반/일정/업무 영역 화면이 다른 멤버의 작업 변경(생성·수정·이동·삭제)을
-- 새로고침 없이 반영하도록 tasks 테이블을 supabase_realtime publication에
-- 추가한다. 이벤트 전달은 RLS(00000000000008, 프로젝트 멤버십)를 그대로 따른다.
--
-- REPLICA IDENTITY FULL — 00000000000019의 attachments와 같은 이유: 기본값(PK만)
-- 으로는 DELETE의 old 레코드에 project_id가 없어 select 정책이 평가 불가(= 거부)로
-- 처리되고, 삭제 이벤트가 다른 멤버 화면에 도달하지 못한다.
-- 작업 첨부(attachments)는 00000000000013에서 이미 publication에 들어가 있다.
-- ============================================================

alter table public.tasks replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;
