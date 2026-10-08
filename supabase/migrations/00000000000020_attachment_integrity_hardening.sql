-- ============================================================
-- 첨부파일 구조적 무결성 강화 — 14단계
--
-- 13단계(00000000000019_chat_attachment_delete_hardening.sql)는 채팅 첨부
-- 삭제를 "메시지 발신자만"으로 좁혔지만, 그 판정이 딛고 선 바닥이 흔들릴 수
-- 있었다:
--
--   1) 00000000000017의 attachments_update_member 정책은 활성 프로젝트
--      멤버라면 첨부 행의 **어떤 컬럼이든** 바꿀 수 있게 허용한다(using/with
--      check가 project_id의 쓰기 가능 여부만 본다) — project_id, target_type,
--      target_id, storage_path, uploaded_by, 업로드 시점 파일 속성(kind/
--      mime_type/size_bytes)까지 전부 UPDATE 대상이었다.
--   2) 그 결과 target_type/target_id를 근거로 "발신자만 삭제 가능"을 판정하는
--      00000000000019의 RLS·RPC는, 삭제 직전에 누군가 target_id를 다른
--      메시지로 바꿔치기하면 우회될 여지가 있었다. storage_path를 바꿔치기
--      하면 Storage 삭제 시 엉뚱한 객체를 가리키게 될 수도 있었다.
--   3) 클라이언트의 deleteChatAttachment()는 브라우저 상태에 들고 있던
--      storagePath를 그대로 Storage 삭제 호출에 사용했다 — DB의 실제
--      storage_path와 대조하지 않으므로, 브라우저가 (버그든 조작이든) 다른
--      값을 전달하면 그 경로의 객체를 지우려 시도하게 된다. 다만 Storage
--      RLS(can_delete_attachment_object, 00000000000019)가 그 경로를 다시
--      독립적으로 검증하므로, 이것만으로 호출자가 원래 지울 수 없던 파일을
--      지울 수 있게 되는 것은 아니다(권한 확장이 아니다) — 실제 위험은
--      "내 첨부 A를 지우려다 잘못된/오래된 경로 때문에 같은 프로젝트의
--      다른 첨부 B의 Storage 객체를 대신 지우는" 데이터 무결성 손상이다
--      (B의 DB 행은 고아로 남고 A의 실제 파일은 지워지지 않는다).
--
-- 이 마이그레이션은 위 세 가지를 다음 두 가지로 닫는다. 1)·2)는 RLS가 딛고
-- 선 바닥(구조적 식별 정보의 불변성) 문제라 실제 권한 경계를 다시 세우고,
-- 3)은 그 위에서 "삭제 대상 id와 경로가 항상 짝지어 나오게" 만들어 위
-- 데이터 무결성 위험을 없앤다. 기존 attachments RLS
-- 정책(00000000000008/00000000000017/00000000000019)은 전혀 건드리지 않는다
-- — Postgres의 컬럼 단위 권한(GRANT/REVOKE)이라는 별도 레이어를 얹어 RLS보다
-- 먼저 걸러낸다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. attachments UPDATE를 original_filename 컬럼 하나로 좁힌다
--
--    대시보드 통합 에셋의 "최신 파일명 변경"(renameAttachment,
--    lib/supabase/repositories/synced-assets.ts)이 유일하게 attachments를
--    UPDATE하는 경로이고, original_filename만 바꾼다 — 기존에도 소유자
--    제한 없이 활성 프로젝트 멤버 전원이 호출할 수 있었고(동기화는 참조를
--    공유하므로 원본이 작업/버그/채팅 첨부여도 그쪽 화면에 이름이 함께
--    반영되는 것이 의도된 동작, 00000000000006 주석 참고) 이 의도는 그대로
--    유지한다.
--
--    컬럼 권한은 RLS보다 먼저 평가되므로, project_id/target_type/target_id/
--    storage_path/external_url/uploaded_by/kind/mime_type/size_bytes/
--    created_at을 건드리는 UPDATE는 RLS 판정까지 가지도 못하고
--    "permission denied for table attachments"로 즉시 거부된다. id(PK)도
--    허용 목록에 없으므로 함께 보호된다. 작업/버그/에셋 첨부의 업로드·삭제
--    (INSERT/DELETE)는 이 마이그레이션이 건드리지 않으므로 그대로 동작한다.
-- ------------------------------------------------------------

revoke update on public.attachments from authenticated;
grant update (original_filename) on public.attachments to authenticated;

comment on column public.attachments.original_filename is
  '표시용 파일명. attachments에서 유일하게 authenticated가 UPDATE 권한을 가진 컬럼이다(00000000000020) — 대시보드 "최신 파일명 변경"이 이 컬럼만 바꾼다. 그 외 컬럼(특히 target_type/target_id/storage_path)은 삽입 이후 불변으로 취급한다.';

-- ------------------------------------------------------------
-- 2. 채팅 첨부 삭제: storage_path를 브라우저가 아니라 DB에서 가져온다
--
--    assert_can_delete_chat_attachment()는 이미 attachments 행을 조회해
--    발신자 여부를 검증한다 — 그 조회로 얻은 storage_path를 반환값으로
--    돌려주면, 클라이언트는 자기 state의 storagePath를 더 이상 Storage
--    삭제에 쓸 필요가 없다. 반환 타입이 바뀌므로(void → text) create or
--    replace로는 안 되고 먼저 drop해야 한다.
--
--    위 1번으로 storage_path가 삽입 이후 불변이 됐으니, 이 함수가 막
--    조회한 값과 실제 삭제 시점의 값이 어긋날 수 없다 — id와 경로가 항상
--    같은 트랜잭션에서 짝지어 나온다.
-- ------------------------------------------------------------

drop function public.assert_can_delete_chat_attachment(uuid);

create function public.assert_can_delete_chat_attachment(p_attachment_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attachment public.attachments;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into v_attachment from public.attachments where id = p_attachment_id;

  if v_attachment.id is null then
    raise exception '첨부파일을 찾을 수 없습니다.';
  end if;

  if v_attachment.target_type <> 'chat_message' then
    raise exception '채팅 첨부파일이 아닙니다.';
  end if;

  if not public.is_project_member(v_attachment.project_id) then
    raise exception '이 프로젝트의 멤버만 첨부파일을 삭제할 수 있습니다.';
  end if;

  if not public.is_project_active(v_attachment.project_id) then
    raise exception '보관된 프로젝트의 첨부파일은 삭제할 수 없습니다. 먼저 복원한 뒤 다시 시도해주세요.';
  end if;

  if not public.is_chat_attachment_deletable(v_attachment.target_type, v_attachment.target_id) then
    raise exception '메시지 작성자만 첨부파일을 삭제할 수 있습니다.';
  end if;

  return v_attachment.storage_path;
end;
$$;

comment on function public.assert_can_delete_chat_attachment is
  '채팅 첨부 삭제 전 UI가 보여줄 한국어 실패 사유를 미리 판정하고, 통과하면 DB에 저장된 storage_path를 반환한다(00000000000020) — 클라이언트가 자기 state의 storagePath를 신뢰해 임의 경로를 Storage 삭제에 쓰지 않도록, id와 경로를 이 함수 안에서 항상 같은 조회로 짝짓는다. 실제 삭제 권한 경계는 attachments/storage.objects의 RLS 정책이다.';

revoke all on function public.assert_can_delete_chat_attachment(uuid) from public, anon;
grant execute on function public.assert_can_delete_chat_attachment(uuid) to authenticated;
