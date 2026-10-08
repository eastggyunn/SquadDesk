-- ============================================================
-- 카테고리 삭제 원자성 보장
--
-- removeAssetCategory(TS)는 이 카테고리 전용 첨부(attachments, target_type=
-- 'asset_category')의 메타데이터 행과 카테고리 행(asset_categories) 자체를
-- 지운다. 앱 계층에서 두 번의 별개 delete 호출로 나누면 첫 delete는 성공하고
-- 두 번째가 실패했을 때(네트워크 등) 카테고리는 남아있는데 전용 첨부만 사라진,
-- 회복하기 애매한 중간 상태가 생길 수 있다.
--
-- Storage 오브젝트(실제 파일 바이트) 삭제는 Postgres 트랜잭션과 원래 원자적으로
-- 묶일 수 없는 별도 시스템 호출이다(uploadAttachment의 업로드/메타데이터 저장이
-- 이미 같은 이유로 두 단계로 나뉘어 있는 것과 동일한 제약). 그래서 클라이언트가
-- Storage SDK로 오브젝트를 먼저 지우고, 이 함수는 그 다음 "attachments 메타데이터
-- 행 + 카테고리 행"이라는 순수 Postgres 상태만 한 트랜잭션으로 묶어 원자성을
-- 보장한다 — 이게 실제로 달성 가능한 원자성의 경계다.
--
-- project_invitations의 accept_project_invitation과 달리 별도 권한 검증 로직이
-- 필요 없다 — security invoker(기본값, 명시적으로 적었다)로 두면 기존
-- attachments_all_member / asset_categories_all_member RLS가 호출자 권한
-- 그대로 적용되어 프로젝트 멤버가 아니면 그냥 0행이 지워진다.
-- ============================================================

create or replace function public.remove_asset_category(p_category_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.attachments
  where target_type = 'asset_category'
    and target_id = p_category_id;

  delete from public.asset_categories
  where id = p_category_id;
end;
$$;

revoke all on function public.remove_asset_category(uuid) from public, anon;
grant execute on function public.remove_asset_category(uuid) to authenticated;
