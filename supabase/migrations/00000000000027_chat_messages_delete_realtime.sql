-- ============================================================
-- Chat Messages: 삭제 실시간 반영
--
-- 채팅 메시지 삭제(발신자 본인만, chat_messages_delete_self — 00000000000017)를
-- 다른 멤버 화면에도 실시간으로 반영하려면 DELETE 이벤트가 클라이언트까지 와야
-- 한다. 기본 REPLICA IDENTITY(기본키만)로는 old 레코드에 project_id/channel_id가
-- 없어 select RLS 평가와 channel_id 필터가 모두 실패하므로, attachments(00…19)·
-- tasks(00…24)와 같은 이유로 FULL로 바꾼다. publication 등록은 00…10에서 끝났다.
-- ============================================================

alter table public.chat_messages replica identity full;
