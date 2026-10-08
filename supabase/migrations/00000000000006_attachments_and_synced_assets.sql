-- ============================================================
-- Attachments (첨부파일 메타데이터) & 통합 에셋 카테고리
--
-- 실제 파일은 Supabase Storage에 저장하고, DB에는 메타데이터와
-- Storage 경로(storage_path)만 저장한다. Figma 링크처럼 파일이 아닌
-- 외부 링크형 첨부는 external_url을 사용한다.
-- ============================================================

create type public.attachment_kind as enum (
  'image', 'spreadsheet', 'build', 'spine', 'figma', 'link', 'other'
);

create type public.attachment_target_type as enum ('task', 'bug', 'chat_message');

create table public.attachments (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects (id) on delete cascade,
  target_type        public.attachment_target_type not null,
  target_id          uuid not null,
  original_filename  text not null,
  storage_path       text,
  external_url       text,
  mime_type          text,
  size_bytes         bigint,
  kind               public.attachment_kind not null default 'other',
  uploaded_by        uuid references public.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  constraint attachments_source_present check (storage_path is not null or external_url is not null)
);

comment on table public.attachments is
  '작업/버그/채팅 메시지에 연결된 첨부파일 메타데이터. 실제 파일은 Supabase Storage(storage_path)에 저장된다.';
comment on column public.attachments.target_id is
  '다형성 참조: target_type에 따라 tasks.id / bugs.id / chat_messages.id 중 하나를 가리킨다. 대상 테이블이 서로 달라 DB 레벨 FK 대신 애플리케이션 계층에서 무결성을 보장한다.';
comment on column public.attachments.storage_path is
  'Supabase Storage 내 경로. 링크형 첨부(예: Figma)는 null일 수 있으며 이 경우 external_url을 사용한다.';

create index attachments_target_idx on public.attachments (target_type, target_id);
create index attachments_project_id_idx on public.attachments (project_id);

-- ------------------------------------------------------------
-- 통합 에셋 카테고리 (대시보드의 "최신 동기화 에셋" 위젯 대응)
-- ------------------------------------------------------------

create table public.asset_categories (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  label       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.asset_categories is '통합 에셋 카테고리(예: 최신 클라이언트 빌드, 마스터 데이터 테이블).';

create unique index asset_categories_project_label_idx on public.asset_categories (project_id, label);

create trigger set_updated_at before update on public.asset_categories
  for each row execute function public.set_updated_at();

create table public.asset_syncs (
  id            uuid primary key default gen_random_uuid(),
  category_id   uuid not null references public.asset_categories (id) on delete cascade,
  attachment_id uuid not null references public.attachments (id) on delete cascade,
  source_label  text not null,
  created_at    timestamptz not null default now()
);

comment on table public.asset_syncs is
  '에셋 카테고리에 동기화된 첨부파일 이력(추가만 하는 로그). 카테고리별 최신 첨부파일은 public.latest_asset_syncs 뷰로 조회한다.';

create index asset_syncs_category_created_idx on public.asset_syncs (category_id, created_at desc);

create view public.latest_asset_syncs
  with (security_invoker = true) as
select distinct on (category_id)
  id, category_id, attachment_id, source_label, created_at
from public.asset_syncs
order by category_id, created_at desc;

comment on view public.latest_asset_syncs is '카테고리(category_id)별 가장 최근에 동기화된 첨부파일 1건.';
