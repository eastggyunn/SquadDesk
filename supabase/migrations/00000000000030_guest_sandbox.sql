-- ============================================================
-- 게스트 체험 (포트폴리오 방문자용 샌드박스)
--
-- 로그인 화면의 "게스트로 둘러보기"는 Supabase 익명 로그인(signInAnonymously)으로
-- 게스트마다 별도 auth 사용자를 만들고, 곧바로 seed_guest_workspace()를 불러
-- 그 게스트만의 샘플 프로젝트(작업·버그·스프린트·채팅)를 채운다. 게스트끼리
-- 데이터가 섞이지 않고, 마음껏 고치거나 지워도 다음 방문자에게 영향이 없다.
--
-- 필요 설정: Supabase 대시보드 › Authentication › Sign In / Providers ›
--           "Allow anonymous sign-ins"를 켠다.
--
-- 설계 결정
-- 1) 익명 사용자도 role은 authenticated다 — 기존 RLS/RPC가 그대로 동작한다.
--    게스트 여부는 JWT의 is_anonymous 클레임(auth.users.is_anonymous)으로만 가른다.
-- 2) 혼자만 있는 프로젝트는 담당자·멘션·멤버 화면이 텅 비어 둘러볼 게 없다. 그래서
--    로그인할 수 없는 "데모 팀원" 4명을 auth.users에 고정 id로 한 번 만들어 두고
--    모든 게스트 프로젝트에 member로 넣는다. 이메일이 없어 메일 요약에서 자연히
--    빠지고(list_notification_digest가 email null을 거른다), 알림도 전부 꺼 둔다.
-- 3) 오래된 게스트는 purge_stale_guests()가 지운다 — 매일 크론(service_role)이 부르고,
--    지운 첨부의 storage 경로를 돌려받아 Storage에서도 지운다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 데모 팀원
-- ------------------------------------------------------------

create or replace function public.demo_teammate_ids()
returns uuid[]
language sql
immutable
as $$
  select array[
    '00000000-0000-4000-a000-00000000d001',
    '00000000-0000-4000-a000-00000000d002',
    '00000000-0000-4000-a000-00000000d003',
    '00000000-0000-4000-a000-00000000d004'
  ]::uuid[];
$$;

comment on function public.demo_teammate_ids is '게스트 샌드박스에 함께 들어가는 데모 팀원(로그인 불가) id 목록.';

-- 비밀번호가 비어 있어 로그인할 수 없다. GoTrue가 NULL 토큰 컬럼을 읽다 실패하지 않도록 ''로 채운다.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', t.id, 'authenticated', 'authenticated', null, '',
  '{"provider":"demo","providers":[]}'::jsonb, jsonb_build_object('name', t.name), now(), now(),
  '', '', '', ''
from (values
  ('00000000-0000-4000-a000-00000000d001'::uuid, '김민준'),
  ('00000000-0000-4000-a000-00000000d002'::uuid, '이서연'),
  ('00000000-0000-4000-a000-00000000d003'::uuid, '박지호'),
  ('00000000-0000-4000-a000-00000000d004'::uuid, '최유나')
) as t(id, name)
on conflict (id) do nothing;

-- public.users 행은 on_auth_user_created 트리거가 만들었다. 직군만 채운다.
update public.users u
set job_roles = r.roles::job_role[]
from (values
  ('00000000-0000-4000-a000-00000000d001'::uuid, '{Programmer}'),
  ('00000000-0000-4000-a000-00000000d002'::uuid, '{Artist}'),
  ('00000000-0000-4000-a000-00000000d003'::uuid, '{Animator}'),
  ('00000000-0000-4000-a000-00000000d004'::uuid, '{QA}')
) as r(id, roles)
where u.id = r.id;

-- 데모 팀원에게는 알림 행이 쌓이지 않게 모든 종류를 끈다(skip_muted_notification).
insert into public.notification_preferences (user_id, muted_kinds, email_muted_kinds)
select unnest(public.demo_teammate_ids()),
  array['task_comment_mention', 'task_comment', 'chat_mention', 'task_assigned', 'bug_assigned',
        'task_status_changed', 'bug_status_changed', 'task_due_soon'],
  '{}'
on conflict (user_id) do update set muted_kinds = excluded.muted_kinds;

-- ------------------------------------------------------------
-- 2. 게스트 샘플 워크스페이스 — 익명 사용자 본인만, 한 번만
-- ------------------------------------------------------------

create or replace function public.seed_guest_workspace()
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid     uuid := auth.uid();
  v_today   date := (now() at time zone 'Asia/Seoul')::date;
  v_project uuid;
  u_dev     uuid := (public.demo_teammate_ids())[1];
  u_art     uuid := (public.demo_teammate_ids())[2];
  u_anim    uuid := (public.demo_teammate_ids())[3];
  u_qa      uuid := (public.demo_teammate_ids())[4];
  d_plan    uuid;
  d_prog    uuid;
  d_art     uuid;
  d_anim    uuid;
  d_qa      uuid;
  s_prev    uuid;
  s_cur     uuid;
  s_next    uuid;
  t_dungeon uuid;
  t_boss    uuid;
  t_inven   uuid;
  t_drop    uuid;
  c_general uuid;
  c_art     uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then
    raise exception '게스트 계정에서만 샘플 워크스페이스를 만들 수 있습니다.';
  end if;

  -- 버튼 연타·재시도로 두 번 불려도 프로젝트가 하나만 생기게 본인 행을 잠그고 확인한다.
  perform 1 from public.users where id = v_uid for update;
  select pm.project_id into v_project from public.project_members pm where pm.user_id = v_uid limit 1;
  if v_project is not null then
    return v_project;
  end if;

  update public.users set name = '게스트', job_roles = '{PM}' where id = v_uid;

  insert into public.projects (name, slug)
  values ('데모 · 픽셀 던전 RPG', 'demo-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
  returning id into v_project;

  insert into public.project_members (project_id, user_id, role)
  values (v_project, v_uid, 'owner')
  on conflict (project_id, user_id) do update set role = 'owner';

  insert into public.project_members (project_id, user_id, role)
  select v_project, unnest(public.demo_teammate_ids()), 'member'
  on conflict (project_id, user_id) do nothing;

  -- 업무 분야
  insert into public.work_domains (project_id, label, sort_order) values (v_project, '기획', 0) returning id into d_plan;
  insert into public.work_domains (project_id, label, sort_order) values (v_project, '프로그래밍', 1) returning id into d_prog;
  insert into public.work_domains (project_id, label, sort_order) values (v_project, '아트', 2) returning id into d_art;
  insert into public.work_domains (project_id, label, sort_order) values (v_project, '애니메이션', 3) returning id into d_anim;
  insert into public.work_domains (project_id, label, sort_order) values (v_project, 'QA', 4) returning id into d_qa;

  -- 스프린트: 지난 / 진행 중 / 다음 — 언제 들어와도 "지금"이 가운데 스프린트에 걸리게 오늘 기준으로 잡는다.
  insert into public.sprints (project_id, name, start_date, end_date)
  values (v_project, 'Sprint 1 · 프로토타입', v_today - 21, v_today - 8) returning id into s_prev;
  insert into public.sprints (project_id, name, start_date, end_date)
  values (v_project, 'Sprint 2 · 알파', v_today - 7, v_today + 6) returning id into s_cur;
  insert into public.sprints (project_id, name, start_date, end_date)
  values (v_project, 'Sprint 3 · 베타 준비', v_today + 7, v_today + 20) returning id into s_next;

  -- 버그·댓글이 가리킬 작업
  insert into public.tasks (project_id, domain_id, sprint_id, title, description, status, priority, assignee_id, reporter_id, start_date, due_date)
  values (v_project, d_prog, s_cur, '던전 절차적 생성 알고리즘',
    'BSP 분할로 방을 나누고 복도로 연결한다. 층마다 시드 고정, 보스방은 항상 가장 먼 방.',
    'In Progress', 'High', u_dev, v_uid, v_today - 6, v_today + 3)
  returning id into t_dungeon;

  insert into public.tasks (project_id, domain_id, sprint_id, title, description, status, priority, assignee_id, reporter_id, start_date, due_date)
  values (v_project, d_anim, s_cur, '보스 몬스터 공격 애니메이션 (Spine)',
    '내려찍기 / 돌진 / 포효 3종. 공격 판정 프레임에 이벤트 키 추가 필요.',
    'In Progress', 'High', u_anim, v_uid, v_today - 5, v_today + 2)
  returning id into t_boss;

  insert into public.tasks (project_id, domain_id, sprint_id, title, description, status, priority, assignee_id, reporter_id, start_date, due_date)
  values (v_project, d_art, s_cur, '인벤토리 UI 디자인',
    '그리드 6x4, 장비 슬롯 분리. 피그마 시안 확정본 기준으로 리소스 export.',
    'QA', 'Medium', u_art, v_uid, v_today - 7, v_today - 1)
  returning id into t_inven;

  insert into public.tasks (project_id, domain_id, sprint_id, title, description, status, priority, assignee_id, reporter_id, start_date, due_date)
  values (v_project, d_plan, s_cur, '아이템 드랍 테이블 밸런싱',
    '1~5층 몬스터별 드랍률 시트 정리. 레어 등급 체감 확률 3% 목표.',
    'In Progress', 'Medium', v_uid, v_uid, v_today - 3, v_today + 1)
  returning id into t_drop;

  insert into public.tasks (project_id, domain_id, sprint_id, title, description, status, priority, assignee_id, reporter_id, start_date, due_date)
  values
    (v_project, d_prog, s_prev, '코어 전투 루프 프로토타입', '이동·공격·회피·피격까지 한 사이클.', 'Done', 'High', u_dev, v_uid, v_today - 21, v_today - 12),
    (v_project, d_art, s_prev, '메인 캐릭터 컨셉 아트', '3안 중 B안 확정.', 'Done', 'Medium', u_art, v_uid, v_today - 20, v_today - 14),
    (v_project, d_plan, s_prev, '게임 기획서 v1 정리', '코어 루프, 성장 구조, 수익 모델 초안.', 'Done', 'High', v_uid, v_uid, v_today - 21, v_today - 15),
    (v_project, d_qa, s_cur, '튜토리얼 스테이지 플레이테스트', '사내 테스터 5명, 이탈 지점 기록.', 'Done', 'Medium', u_qa, v_uid, v_today - 6, v_today - 2),
    (v_project, d_prog, s_cur, '세이브/로드 시스템', 'JSON 직렬화 + 클라우드 세이브 대비 인터페이스 분리.', 'Todo', 'Medium', u_dev, v_uid, v_today + 1, v_today + 5),
    (v_project, d_anim, s_cur, '타이틀 화면 연출', '로고 등장 + 배경 패럴랙스.', 'Todo', 'Low', u_anim, v_uid, v_today + 2, v_today + 6),
    (v_project, d_qa, s_cur, '알파 빌드 회귀 테스트', '체크리스트 120항목. 크래시 0건이 알파 통과 기준.', 'Todo', 'High', u_qa, v_uid, v_today + 3, v_today + 6),
    (v_project, d_art, s_next, '2지역 타일셋 제작', '얼음 동굴 테마, 32x32.', 'Todo', 'Medium', u_art, v_uid, v_today + 7, v_today + 15),
    (v_project, d_prog, s_next, '상점 NPC 대화 시스템', '분기 대화 + 호감도.', 'Todo', 'Low', null, v_uid, v_today + 8, v_today + 14),
    (v_project, d_plan, s_next, '스팀 페이지 스크린샷·트레일러', '스크린샷 8장, 30초 트레일러 콘티.', 'Todo', 'Low', v_uid, v_uid, v_today + 12, v_today + 20),
    (v_project, d_plan, null, '업적 시스템 아이디어 정리', '백로그 — 베타 이후 검토.', 'Todo', 'Low', null, v_uid, null, null);

  -- 버그
  insert into public.bugs (project_id, task_id, title, location, reproduction_steps, console_log, severity, status, reporter_id, assignee_id)
  values
    (v_project, t_inven, '인벤토리 슬롯 드래그 시 아이콘이 사라짐', '인벤토리 UI',
      E'1. 인벤토리 열기\n2. 아이템을 빈 슬롯 밖으로 드래그해서 놓기\n3. 아이콘이 사라지고 아이템이 복구되지 않음',
      E'NullReferenceException: Object reference not set to an instance of an object\n  at InventorySlot.OnEndDrag (PointerEventData eventData) [0x0001a] in InventorySlot.cs:87',
      'Blocker', 'Open', u_qa, u_dev),
    (v_project, t_dungeon, '던전 3층 진입 시 프레임 드랍', '던전 3층 / 보스방 입구',
      E'1. 3층 진입\n2. 보스방 방향으로 이동\n3. 미니맵 갱신 시점에 30fps 이하로 떨어짐',
      'Profiler: GC.Alloc 48.2MB in DungeonMinimap.Update()',
      'High', 'Open', u_qa, u_dev),
    (v_project, t_boss, '보스 공격 모션 끝에서 1프레임 튐', '보스전 / 2페이즈',
      E'1. 보스 2페이즈 돌입\n2. 내려찍기 공격이 끝나는 순간 Idle로 넘어가며 위치가 튐',
      null, 'Medium', 'In Progress', u_qa, u_anim),
    (v_project, null, '일시정지 중 BGM 볼륨 조절이 반영되지 않음', '설정 메뉴',
      E'1. 전투 중 일시정지\n2. 설정 › 사운드에서 BGM 슬라이더 조절\n3. 재개 전까지 반영 안 됨',
      null, 'Low', 'Resolved', v_uid, u_dev),
    (v_project, null, '튜토리얼 대사 오타', '튜토리얼 1-2',
      '"회피를 사용할려면" → "회피를 사용하려면"', null, 'Low', 'Closed', u_qa, v_uid);

  -- 작업 댓글 (게스트 멘션 → 알림함에 하나 들어간다)
  insert into public.task_comments (project_id, task_id, author_id, content, mentioned_user_ids, created_at)
  values
    (v_project, t_boss, u_anim, '내려찍기는 1차 완성했어요. 돌진은 내일 오전까지 올리겠습니다.', '{}', now() - interval '5 hours'),
    (v_project, t_boss, u_art, '@게스트 보스 실루엣 수정본 반영해야 할까요? 확인 부탁드려요.', array[v_uid], now() - interval '2 hours'),
    (v_project, t_dungeon, u_dev, '시드 고정은 끝났고, 복도 연결에서 가끔 고립된 방이 생기는 문제 보고 있어요.', '{}', now() - interval '1 day');

  -- 채팅
  insert into public.chat_channels (project_id, name, created_by) values (v_project, '일반', v_uid) returning id into c_general;
  insert into public.chat_channels (project_id, name, created_by) values (v_project, '아트-피드백', u_art) returning id into c_art;

  insert into public.chat_messages (project_id, channel_id, sender_id, content, mentioned_user_ids, created_at)
  values
    (v_project, c_general, u_dev, '오늘 알파 빌드 브랜치 따놨습니다. 머지는 금요일까지만 받을게요!', '{}', now() - interval '26 hours'),
    (v_project, c_general, u_qa, '인벤토리 드래그 블로커 하나 올렸어요. 알파 전에 꼭 봐야 할 것 같습니다.', '{}', now() - interval '20 hours'),
    (v_project, c_general, u_anim, '보스 애니메이션 진행 상황 칸반에 업데이트했어요.', '{}', now() - interval '6 hours'),
    (v_project, c_general, u_dev, '@게스트 드랍 테이블 시트 공유해주시면 바로 데이터 넣을게요.', array[v_uid], now() - interval '1 hour'),
    (v_project, c_art, u_art, '2지역 타일셋 무드보드 올렸습니다. 얼음 톤 너무 차가운지 의견 주세요.', '{}', now() - interval '3 hours');

  -- 담당 배정 알림 하나 — 시드는 게스트 본인(auth.uid())이 행동한 것으로 돌아 트리거가 보내지 않으므로 직접 넣는다.
  insert into public.notifications (user_id, project_id, kind, actor_id, task_id, created_at)
  values (v_uid, v_project, 'task_assigned', u_dev, t_drop, now() - interval '30 minutes');

  return v_project;
end;
$$;

comment on function public.seed_guest_workspace is
  '익명(게스트) 사용자 본인에게 샘플 프로젝트를 한 번 만들어 준다. 이미 소속 프로젝트가 있으면 그 id를 돌려준다.';

revoke all on function public.seed_guest_workspace() from public, anon;
grant execute on function public.seed_guest_workspace() to authenticated;

-- ------------------------------------------------------------
-- 3. 마지막 owner 보호 트리거가 "프로젝트 삭제"의 cascade는 막지 않게
--    (00000000000012의 함수를 대체한다). 지금까지는 프로젝트를 지우는 경로가 없어
--    문제가 없었지만, 게스트 정리가 처음으로 projects 행을 지운다 — cascade로
--    멤버십이 지워질 때는 프로젝트가 이미 없으니 owner를 남길 이유도 없다.
-- ------------------------------------------------------------

create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role <> 'owner' or (tg_op = 'UPDATE' and new.role = 'owner') then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' and not exists (select 1 from public.projects where id = old.project_id) then
    return old;
  end if;

  perform 1 from public.projects where id = old.project_id for update;

  if not exists (
    select 1 from public.project_members
    where project_id = old.project_id
      and role = 'owner'
      and user_id <> old.user_id
  ) then
    raise exception '프로젝트에는 최소 한 명의 owner가 있어야 합니다.';
  end if;

  return coalesce(new, old);
end;
$$;

-- ------------------------------------------------------------
-- 4. 오래된 게스트 정리 — 크론(service_role) 전용
--    게스트만 남은 프로젝트를 지우고(하위 데이터는 cascade), 익명 사용자를 지운다.
--    정식 사용자가 초대로 합류한 프로젝트는 남긴다. 지운 첨부의 storage 경로를 돌려준다.
-- ------------------------------------------------------------

create or replace function public.purge_stale_guests(p_older_than interval default interval '3 days')
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest_ids   uuid[];
  v_project_ids uuid[];
begin
  select coalesce(array_agg(au.id), '{}') into v_guest_ids
  from auth.users au
  where au.is_anonymous and au.created_at < now() - p_older_than;

  if cardinality(v_guest_ids) = 0 then
    return;
  end if;

  select coalesce(array_agg(distinct pm.project_id), '{}') into v_project_ids
  from public.project_members pm
  where pm.user_id = any (v_guest_ids)
    and not exists (
      select 1
      from public.project_members other
      join auth.users au on au.id = other.user_id
      where other.project_id = pm.project_id
        and not au.is_anonymous
        and not (other.user_id = any (public.demo_teammate_ids()))
    );

  return query
    select a.storage_path from public.attachments a
    where a.project_id = any (v_project_ids) and a.storage_path is not null;

  delete from public.projects where id = any (v_project_ids);

  -- 남는 프로젝트에서 게스트가 유일한 owner였다면, 게스트를 지우기 전에 정식 멤버를 owner로 올린다
  -- (그러지 않으면 마지막 owner 보호 트리거가 게스트 삭제를 막는다).
  update public.project_members pm
  set role = 'owner'
  where pm.role <> 'owner'
    and not (pm.user_id = any (v_guest_ids))
    and not (pm.user_id = any (public.demo_teammate_ids()))
    and pm.project_id in (
      select g.project_id from public.project_members g
      where g.user_id = any (v_guest_ids) and g.role = 'owner'
        and not exists (
          select 1 from public.project_members o
          where o.project_id = g.project_id and o.role = 'owner' and not (o.user_id = any (v_guest_ids))
        )
    );

  delete from auth.users where id = any (v_guest_ids);
end;
$$;

revoke all on function public.purge_stale_guests(interval) from public, anon, authenticated;
grant execute on function public.purge_stale_guests(interval) to service_role;
