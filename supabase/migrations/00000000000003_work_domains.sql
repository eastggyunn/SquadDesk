-- ============================================================
-- Work Domains (업무 영역)
--
-- 프론트엔드 WorkDomain(lib/store/work-domains-store.ts)에 대응.
-- 프로젝트별로 정렬 순서(sort_order)를 갖는다.
-- ============================================================

create table public.work_domains (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  label       text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.work_domains is '업무 영역(예: 클라이언트 프로그래밍, 사운드/오디오). 작업(tasks)을 분류하는 데 사용한다.';
comment on column public.work_domains.sort_order is '같은 프로젝트 내 표시 순서. 프론트엔드의 드래그 정렬(reorderDomains)과 대응한다.';

create unique index work_domains_project_label_idx on public.work_domains (project_id, label);
create index work_domains_project_sort_idx on public.work_domains (project_id, sort_order);

create trigger set_updated_at before update on public.work_domains
  for each row execute function public.set_updated_at();
