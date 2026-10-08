-- ============================================================
-- Attachment Storage: private 버킷 + RLS
--
-- 첨부파일 실 데이터는 Storage 버킷 "attachments"에 저장한다. 오브젝트 경로는
-- "{project_id}/{attachment_id}/{original_filename}" 형태로 프로젝트 id와 첨부 id를
-- 모두 포함시켜, 프로젝트 간 파일이 섞이거나 다른 프로젝트의 파일 경로를 추측할 수
-- 없게 한다. 버킷은 public이 아니므로(=public: false) 다운로드는 반드시 클라이언트가
-- 발급받는 signed URL을 통해서만 가능하고, service role key나 공개 URL은 쓰지 않는다.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 20971520) -- 20MB, 애플리케이션 레벨 제한과 이중 방어
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

-- 오브젝트 경로의 첫 세그먼트(프로젝트 id)를 안전하게 uuid로 추출한다. 예상한
-- 규칙("{project_id}/...")을 벗어난 경로가 들어와도 예외를 던지는 대신 null을
-- 반환해, RLS 평가 중 캐스팅 에러로 쿼리 전체가 실패하는 일이 없게 한다.
-- is_project_member(null)은 false이므로 이 경우 접근은 안전하게 거부된다.
create or replace function public.attachment_object_project_id(object_name text)
returns uuid
language plpgsql
immutable
as $$
begin
  return (storage.foldername(object_name))[1]::uuid;
exception when others then
  return null;
end;
$$;

-- 프로젝트 멤버만 자신이 속한 프로젝트 폴더의 파일을 조회/업로드/삭제할 수 있다.
-- 파일은 업로드 후 내용이 바뀌지 않는 것으로 간주해(재업로드는 새 첨부로 처리)
-- update 정책은 별도로 두지 않는다.
create policy attachments_bucket_select_member on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and public.is_project_member(public.attachment_object_project_id(name))
  );

create policy attachments_bucket_insert_member on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and public.is_project_member(public.attachment_object_project_id(name))
  );

create policy attachments_bucket_delete_member on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and public.is_project_member(public.attachment_object_project_id(name))
  );
