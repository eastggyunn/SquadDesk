-- ============================================================
-- 채팅 첨부파일 개별 삭제 — 권한 강화
--
-- 13단계: 채팅 메시지에 첨부된 파일을 메시지 본문/다른 첨부는 그대로 둔 채
-- 개별로 삭제하는 기능을 추가한다. 기존 attachments 삭제 RLS
-- (00000000000008_row_level_security.sql, 00000000000017_project_archive_and_restore.sql)는
-- "프로젝트 멤버 + 활성 프로젝트"만 확인했다 — target_type이 chat_message여도
-- 메시지 작성자가 아닌 다른 멤버가 지울 수 있었다. 작업/버그 첨부는 팀
-- 전체가 관리하는 산출물이라 이 권한으로 충분하지만(그대로 유지), 채팅
-- 메시지 자체는 이미 작성자 전용 쓰기다(chat_messages_update_self/delete_self,
-- 00000000000008). 첨부도 같은 경계를 따르도록 이번 마이그레이션에서
-- target_type='chat_message' 케이스만 좁힌다.
--
-- 클라이언트에서 삭제 버튼을 숨기는 것은 UX일 뿐 권한 경계가 아니므로,
-- 아래 RLS 정책이 실제 경계다. 여기에 더해 UI가 구체적인 한국어 실패
-- 사유(작성자 아님 / 보관됨 / 멤버 아님)를 미리 보여줄 수 있도록
-- assert_can_delete_chat_attachment() RPC도 추가한다 — 실제 삭제 실행은
-- lib/supabase/repositories/attachments.ts의 deleteAttachmentRow(Storage
-- 우선 삭제 → 메타데이터 삭제, 작업/버그 첨부 삭제와 동일한 순서/재시도
-- 동작)를 그대로 재사용한다.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Realtime DELETE 이벤트가 project_id 등 비-PK 컬럼을 담도록
--
--    Supabase Realtime의 postgres_changes는 전달 전에 select 정책을
--    평가하는데, 기본 REPLICA IDENTITY(기본키만)로는 DELETE의 old 레코드에
--    project_id가 없어 attachments_select_member 정책이 평가 불가(= 거부)로
--    처리되어 이벤트 자체가 클라이언트에 도달하지 못한다. FULL로 바꿔
--    이번 단계에서 새로 구독하는 DELETE 이벤트가 다른 화면에도 실시간으로
--    반영되게 한다.
-- ------------------------------------------------------------

alter table public.attachments replica identity full;

-- ------------------------------------------------------------
-- 1. 공유 판정 함수 — "이 첨부, 삭제해도 되는가(채팅 한정)"
--
--    같은 규칙(채팅 첨부는 발신자만)을 attachments 테이블 RLS, Storage RLS,
--    사전 확인 RPC 세 곳이 각자 다시 쓰면 규칙이 바뀔 때(예: 채널 운영자도
--    삭제 허용) 세 곳을 손으로 맞춰야 한다. 하나로 모아 셋이 공유한다.
-- ------------------------------------------------------------

create or replace function public.is_chat_attachment_deletable(
  p_target_type public.attachment_target_type,
  p_target_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_target_type <> 'chat_message'
    or exists (
      select 1 from public.chat_messages m
      where m.id = p_target_id and m.sender_id = auth.uid()
    );
$$;

comment on function public.is_chat_attachment_deletable is
  '채팅 첨부(target_type=chat_message)는 그 메시지의 발신자만 삭제할 수 있다는 단일 판정. attachments 삭제 RLS, Storage 삭제 RLS(can_delete_attachment_object 경유), assert_can_delete_chat_attachment RPC가 모두 이 함수를 공유한다.';

revoke all on function public.is_chat_attachment_deletable(public.attachment_target_type, uuid) from public, anon;
grant execute on function public.is_chat_attachment_deletable(public.attachment_target_type, uuid) to authenticated;

-- ------------------------------------------------------------
-- 2. attachments 테이블: 채팅 첨부는 발신자만 삭제
--    (00000000000017의 attachments_delete_member를 대체)
-- ------------------------------------------------------------

drop policy attachments_delete_member on public.attachments;

create policy attachments_delete_member on public.attachments
  for delete to authenticated
  using (
    public.is_project_writable(project_id)
    and public.is_chat_attachment_deletable(target_type, target_id)
  );

comment on policy attachments_delete_member on public.attachments is
  '작업/버그/에셋 첨부는 활성 프로젝트 멤버라면 삭제 가능. 채팅 메시지 첨부(target_type=chat_message)는 그 메시지의 발신자만 삭제할 수 있다(is_chat_attachment_deletable).';

-- ------------------------------------------------------------
-- 3. Storage(attachments 버킷): 같은 경계를 오브젝트 경로에서 재구성
--
--    오브젝트 경로는 "{project_id}/{attachment_id}/{filename}"이다
--    (00000000000011_attachment_storage.sql). attachments.storage_path로
--    역참조해 target_type/target_id를 얻은 뒤 is_chat_attachment_deletable로
--    같은 판정을 재사용한다. Storage 삭제가 항상 메타데이터 삭제보다 먼저
--    실행되므로(공유 deleteAttachmentRow), 이 시점엔 attachments 행이 아직
--    남아 있다.
-- ------------------------------------------------------------

create or replace function public.can_delete_attachment_object(object_name text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select public.is_chat_attachment_deletable(a.target_type, a.target_id)
      from public.attachments a
      where a.storage_path = object_name
      limit 1
    ),
    -- attachments 행을 찾지 못하면(예: 메타데이터가 먼저 지워진 뒤 재시도해
    -- 이미 없는 파일을 다시 지우는 경우) target_type을 알 수 없다. 이 경우
    -- 채팅 첨부 여부를 판별할 근거가 없으므로 막지 않는다 — 프로젝트
    -- 멤버십·활성 여부는 이 정책의 다른 조건(is_project_writable)이 이미
    -- 확인한다.
    true
  );
$$;

comment on function public.can_delete_attachment_object is
  '오브젝트 경로에 연결된 attachments 행을 찾아 is_chat_attachment_deletable로 같은 판정을 재사용한다. attachments 삭제 RLS와 같은 경계를 Storage에서 재구성한다.';

drop policy attachments_bucket_delete_member on storage.objects;

create policy attachments_bucket_delete_member on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and public.is_project_writable(public.attachment_object_project_id(name))
    and public.can_delete_attachment_object(name)
  );

revoke all on function public.can_delete_attachment_object(text) from public, anon;
grant execute on function public.can_delete_attachment_object(text) to authenticated;

-- ------------------------------------------------------------
-- 4. 사전 권한 확인 RPC — 실제 삭제 전 한국어 에러 메시지용
--
--    실제 삭제 권한 경계는 위 RLS 정책이다. 이 함수는 클라이언트가
--    Storage/메타데이터 삭제를 시도하기 전에 미리 구체적인 사유를 알려주기
--    위한 것이다. 이 판정이 RLS와 어긋나는 경우(레이스 컨디션 등)에도
--    안전하다 — 그때는 deleteAttachmentRow의 실제 삭제 자체가 RLS에 막혀
--    실패하고, 그 실패도 재시도 가능한 일반 오류로 처리된다.
-- ------------------------------------------------------------

create or replace function public.assert_can_delete_chat_attachment(p_attachment_id uuid)
returns void
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

  -- target_type은 위에서 이미 chat_message로 확정했으므로, 여기서는
  -- is_chat_attachment_deletable이 발신자 검사만 수행한다(RLS/Storage와
  -- 같은 판정을 재사용).
  if not public.is_chat_attachment_deletable(v_attachment.target_type, v_attachment.target_id) then
    raise exception '메시지 작성자만 첨부파일을 삭제할 수 있습니다.';
  end if;
end;
$$;

comment on function public.assert_can_delete_chat_attachment is
  '채팅 첨부 삭제 전 UI가 보여줄 한국어 실패 사유를 미리 판정한다. 실제 삭제 권한 경계는 attachments/storage.objects의 RLS 정책이다.';

revoke all on function public.assert_can_delete_chat_attachment(uuid) from public, anon;
grant execute on function public.assert_can_delete_chat_attachment(uuid) to authenticated;
