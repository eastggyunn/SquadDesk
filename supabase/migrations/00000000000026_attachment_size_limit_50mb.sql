-- ============================================================
-- Attachment Storage: 버킷 용량 제한 20MB → 50MB
--
-- Supabase 전역 업로드 제한(Free 플랜 상한, Pro 기본값)인 50MB에 맞춘다. 버킷 값을
-- 이보다 높여도 전역 제한에서 막히므로 의미가 없다. 애플리케이션 레벨 제한
-- (lib/supabase/repositories/attachments.ts의 MAX_ATTACHMENT_SIZE_BYTES)과 함께 바꾼다.
-- ============================================================

update storage.buckets
set file_size_limit = 52428800 -- 50MB
where id = 'attachments';
