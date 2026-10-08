-- ============================================================
-- Chat Channels & Messages
--
-- 기존 public.chats는 room_id(text)로 느슨하게 채널을 구분했다.
-- 실제 채널 엔터티(chat_channels)를 만들고, chats를 chat_messages로
-- 승격시켜 channel_id로 연결한다. 기존 room_id 값은 유실 없이
-- 동일한 이름의 채널로 백필한다.
-- ============================================================

create table public.chat_channels (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null,
  created_by  uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.chat_channels is '프론트엔드 ChatChannel(lib/store/chat-store.ts)에 대응하는 채팅 채널.';

create unique index chat_channels_project_name_idx on public.chat_channels (project_id, name);

create trigger set_updated_at before update on public.chat_channels
  for each row execute function public.set_updated_at();

-- 기존 chats.room_id 값마다 채널을 생성해 백필한다 (부트스트랩 기본 프로젝트 소속).
insert into public.chat_channels (project_id, name)
select '00000000-0000-0000-0000-000000000001', r.room_id
from (select distinct room_id from public.chats) r
on conflict (project_id, name) do nothing;

alter table public.chats
  add column channel_id uuid references public.chat_channels (id) on delete cascade;

update public.chats c
set channel_id = ch.id
from public.chat_channels ch
where ch.project_id = '00000000-0000-0000-0000-000000000001'
  and ch.name = c.room_id;

alter table public.chats alter column channel_id set not null;
alter table public.chats drop column room_id;

-- 프론트엔드 ChatMessage.content에 맞춰 컬럼명을 통일하고, 테이블 정체성도
-- "채팅 로그"에서 "채널 메시지"로 명확히 하기 위해 chat_messages로 개명한다.
alter table public.chats rename column message to content;
alter table public.chats rename to chat_messages;

alter table public.chat_messages
  add column project_id uuid not null references public.projects (id) on delete cascade
    default '00000000-0000-0000-0000-000000000001',
  add column updated_at timestamptz not null default now();
alter table public.chat_messages alter column project_id drop default;

create trigger set_updated_at before update on public.chat_messages
  for each row execute function public.set_updated_at();

create index chat_messages_channel_id_created_at_idx on public.chat_messages (channel_id, created_at);
create index chat_messages_project_id_idx on public.chat_messages (project_id);
