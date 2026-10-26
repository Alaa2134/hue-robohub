-- Projects & Team Matching: a student posts a project idea and the skills it needs; others ask to
-- join with a short message and what they bring. Matching uses verified skills (Lab challenges passed,
-- by area) next to what the student says, and says which is which. Names are a first name and an
-- initial; the owner's contact link (a WhatsApp group, a Discord) is shown to members only. No phone
-- numbers. Requests and answers reach the other side as notifications. The team (students area) can
-- see every team and close one that breaks the rules.
-- Needs 20261026200000_academy.sql (lab_challenges.skill, lab_challenge_passes) and
-- 20261026500000_skill_passport.sql (passport links on requests).

create or replace function private.team_skills() returns text[] language sql immutable as $$
  select array['programming', 'electronics', 'robotics', 'mechanical', 'cad', 'design', 'ai', 'business']
$$;

create table if not exists public.project_teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.students(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 100),
  idea text not null default '' check (char_length(idea) <= 1500),
  needs text[] not null default '{}' check (needs <@ private.team_skills() and cardinality(needs) <= 8),
  size_max int not null default 4 check (size_max between 2 and 8),
  contact text check (contact is null or (contact ~* '^https://[^[:space:]]+$' and char_length(contact) <= 300)),
  status text not null default 'open' check (status in ('open', 'full', 'closed')),
  closed_reason text check (char_length(closed_reason) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_teams_owner on public.project_teams (owner_id);
create index if not exists project_teams_open on public.project_teams (status, created_at desc);

create table if not exists public.project_team_members (
  team_id uuid not null references public.project_teams(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, student_id)
);
create index if not exists project_team_members_student on public.project_team_members (student_id);

create table if not exists public.project_team_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.project_teams(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  message text not null default '' check (char_length(message) <= 500),
  skills text[] not null default '{}' check (skills <@ private.team_skills()),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  unique (team_id, student_id)
);
create index if not exists project_team_requests_student on public.project_team_requests (student_id);

alter table public.project_teams enable row level security;
alter table public.project_team_members enable row level security;
alter table public.project_team_requests enable row level security;
revoke all on public.project_teams, public.project_team_members, public.project_team_requests from anon, authenticated;

/** Skills a student has shown in the Lab: { area: challenges passed }. */
create or replace function private.verified_skills(p_student uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(c.skill, c.n), '{}') from (
    select lc.skill, count(*) as n from public.lab_challenge_passes p join public.lab_challenges lc on lc.slug = p.slug
     where p.student_id = p_student group by lc.skill) c
$$;

/** Everything the Teams screen shows a student: their teams (with requests if they own them) and the open ones. */
create or replace function public.student_teams(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := private.session_student(p_token);
  v_skills jsonb := private.verified_skills(v_id);
begin
  return jsonb_build_object(
    'skills', v_skills,
    'mine', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'title', t.title, 'idea', t.idea, 'needs', t.needs, 'size_max', t.size_max, 'status', t.status,
               'closed_reason', t.closed_reason, 'owner', t.owner_id = v_id, 'contact', t.contact,
               'members', (select jsonb_agg(jsonb_build_object('name', private.short_name(s.full_name), 'owner', s.id = t.owner_id, 'me', s.id = v_id) order by m.joined_at)
                             from public.project_team_members m join public.students s on s.id = m.student_id where m.team_id = t.id),
               'requests', case when t.owner_id = v_id then coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', r.id, 'name', private.short_name(s.full_name), 'message', r.message, 'skills', r.skills,
                          'verified', private.verified_skills(s.id),
                          'passport', (select pp.slug from public.skill_passports pp where pp.student_id = s.id and pp.visible),
                          'at', r.created_at) order by r.created_at)
                   from public.project_team_requests r join public.students s on s.id = r.student_id
                  where r.team_id = t.id and r.status = 'pending' and s.active), '[]') end)
             order by t.status = 'closed', t.updated_at desc)
        from public.project_teams t
       where exists (select 1 from public.project_team_members m where m.team_id = t.id and m.student_id = v_id)), '[]'),
    'open', coalesce((
      select jsonb_agg(x.j order by x.match desc, x.created_at desc) from (
        select t.created_at,
               (select count(*) from unnest(t.needs) n where v_skills ? n) as match,
               jsonb_build_object(
                 'id', t.id, 'title', t.title, 'idea', t.idea, 'needs', t.needs, 'size_max', t.size_max,
                 'owner', private.short_name(s.full_name), 'group', nullif(s.group_name, ''),
                 'members', (select count(*) from public.project_team_members m where m.team_id = t.id),
                 'match', array(select n from unnest(t.needs) n where v_skills ? n),
                 'request', (select r.status from public.project_team_requests r where r.team_id = t.id and r.student_id = v_id)) as j
          from public.project_teams t join public.students s on s.id = t.owner_id and s.active
         where t.status = 'open' and not exists (select 1 from public.project_team_members m where m.team_id = t.id and m.student_id = v_id)
         order by t.created_at desc limit 60) x), '[]'));
end $$;

/** Create a team (the student owns it and is its first member) or edit one they own. */
create or replace function public.student_team_save(p_token text, p_id uuid, p_title text, p_idea text, p_needs text[], p_size int, p_contact text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := private.session_student(p_token);
  v_team uuid := p_id;
  v_contact text := nullif(btrim(coalesce(p_contact, '')), '');
begin
  if char_length(btrim(coalesce(p_title, ''))) not between 3 and 100 then return jsonb_build_object('ok', false, 'error', 'title'); end if;
  if not (coalesce(p_needs, '{}') <@ private.team_skills()) then return jsonb_build_object('ok', false, 'error', 'skills'); end if;
  if v_contact is not null and v_contact !~* '^https://[^[:space:]]+$' then return jsonb_build_object('ok', false, 'error', 'contact'); end if;
  if v_team is null then
    if not private.throttle('team_create:' || v_id, 5, interval '1 day') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
    if (select count(*) from public.project_teams where owner_id = v_id and status <> 'closed') >= 2 then
      return jsonb_build_object('ok', false, 'error', 'too_many');
    end if;
    insert into public.project_teams (owner_id, title, idea, needs, size_max, contact)
    values (v_id, btrim(p_title), left(coalesce(p_idea, ''), 1500), coalesce(p_needs, '{}'), least(8, greatest(2, coalesce(p_size, 4))), v_contact)
    returning id into v_team;
    insert into public.project_team_members (team_id, student_id) values (v_team, v_id);
  else
    update public.project_teams
       set title = btrim(p_title), idea = left(coalesce(p_idea, ''), 1500), needs = coalesce(p_needs, '{}'),
           size_max = greatest((select count(*) from public.project_team_members m where m.team_id = v_team)::int, least(8, greatest(2, coalesce(p_size, 4)))),
           contact = v_contact, updated_at = now()
     where id = v_team and owner_id = v_id and status <> 'closed';
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_team);
end $$;

/** The owner opens or closes their team (a team the BuildX team closed stays closed). */
create or replace function public.student_team_status(p_token text, p_team uuid, p_open boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := private.session_student(p_token);
begin
  update public.project_teams t
     set status = case when not p_open then 'closed'
                       when (select count(*) from public.project_team_members m where m.team_id = t.id) >= t.size_max then 'full' else 'open' end,
         updated_at = now()
   where t.id = p_team and t.owner_id = v_id and t.closed_reason is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

/** Ask to join an open team, saying why and what you bring. */
create or replace function public.student_team_request(p_token text, p_team uuid, p_message text, p_skills text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := private.session_student(p_token);
  t public.project_teams;
begin
  if not private.throttle('team_request:' || v_id, 15, interval '1 day') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not (coalesce(p_skills, '{}') <@ private.team_skills()) then return jsonb_build_object('ok', false, 'error', 'skills'); end if;
  select * into t from public.project_teams where id = p_team and status = 'open';
  if t.id is null then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if exists (select 1 from public.project_team_members where team_id = t.id and student_id = v_id) then return jsonb_build_object('ok', false, 'error', 'member'); end if;
  if (select count(*) from public.project_team_requests where student_id = v_id and status = 'pending') >= 5 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;
  insert into public.project_team_requests (team_id, student_id, message, skills)
  values (t.id, v_id, left(btrim(coalesce(p_message, '')), 500), coalesce(p_skills, '{}'))
  on conflict (team_id, student_id) do nothing;
  if not found then return jsonb_build_object('ok', false, 'error', 'already'); end if;
  perform private.notify_student_ids(array[t.owner_id], 'طلب انضمام لفريقك', left(t.title, 80), '/app/#/me/teams');
  return jsonb_build_object('ok', true);
end $$;

/** The owner accepts or declines a request; accepted joins the team (and fills it at its size). */
create or replace function public.student_team_answer(p_token text, p_request uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := private.session_student(p_token);
  r public.project_team_requests;
  t public.project_teams;
begin
  select * into r from public.project_team_requests where id = p_request and status = 'pending';
  select * into t from public.project_teams where id = r.team_id and owner_id = v_id;
  if r.id is null or t.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if p_accept then
    if t.status <> 'open' or (select count(*) from public.project_team_members where team_id = t.id) >= t.size_max then
      return jsonb_build_object('ok', false, 'error', 'full');
    end if;
    insert into public.project_team_members (team_id, student_id) values (t.id, r.student_id) on conflict do nothing;
    if (select count(*) from public.project_team_members where team_id = t.id) >= t.size_max then
      update public.project_teams set status = 'full', updated_at = now() where id = t.id;
    end if;
  end if;
  update public.project_team_requests set status = case when p_accept then 'accepted' else 'declined' end, answered_at = now() where id = r.id;
  perform private.notify_student_ids(array[r.student_id], case when p_accept then 'اتقبلت في الفريق' else 'رد على طلبك' end, left(t.title, 80), '/app/#/me/teams');
  return jsonb_build_object('ok', true);
end $$;

/** A member leaves a team (the owner closes it instead). */
create or replace function public.student_team_leave(p_token text, p_team uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := private.session_student(p_token);
begin
  if exists (select 1 from public.project_teams where id = p_team and owner_id = v_id) then return jsonb_build_object('ok', false, 'error', 'owner'); end if;
  delete from public.project_team_members where team_id = p_team and student_id = v_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  update public.project_teams set status = 'open', updated_at = now() where id = p_team and status = 'full';
  return jsonb_build_object('ok', true);
end $$;

/** The BuildX team: every team, to keep an eye on them. */
create or replace function public.staff_project_teams()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_read('students') then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', t.id, 'title', t.title, 'idea', t.idea, 'needs', t.needs, 'size_max', t.size_max, 'status', t.status, 'closed_reason', t.closed_reason,
             'contact', t.contact, 'created_at', t.created_at, 'owner', s.full_name, 'owner_code', s.code, 'group', s.group_name,
             'members', (select jsonb_agg(st.full_name order by m.joined_at) from public.project_team_members m join public.students st on st.id = m.student_id where m.team_id = t.id),
             'pending', (select count(*) from public.project_team_requests r where r.team_id = t.id and r.status = 'pending'))
           order by t.status = 'closed', t.created_at desc)
      from public.project_teams t join public.students s on s.id = t.owner_id), '[]');
end $$;

/** The BuildX team closes a team that breaks the rules, saying why (the owner sees the reason). */
create or replace function public.staff_project_team_close(p_team uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.project_teams;
begin
  if not private.can('students') then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 200 then return jsonb_build_object('ok', false, 'error', 'reason'); end if;
  update public.project_teams set status = 'closed', closed_reason = btrim(p_reason), updated_at = now() where id = p_team returning * into t;
  if t.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform private.notify_student_ids(array[t.owner_id], 'فريقك اتقفل', left(t.title, 80), '/app/#/me/teams');
  return jsonb_build_object('ok', true);
end $$;

revoke all on function private.team_skills(), private.verified_skills(uuid) from public, anon, authenticated;
revoke all on function public.student_teams(text), public.student_team_save(text, uuid, text, text, text[], int, text), public.student_team_status(text, uuid, boolean),
  public.student_team_request(text, uuid, text, text[]), public.student_team_answer(text, uuid, boolean), public.student_team_leave(text, uuid) from public;
grant execute on function public.student_teams(text), public.student_team_save(text, uuid, text, text, text[], int, text), public.student_team_status(text, uuid, boolean),
  public.student_team_request(text, uuid, text, text[]), public.student_team_answer(text, uuid, boolean), public.student_team_leave(text, uuid) to anon, authenticated;
revoke all on function public.staff_project_teams(), public.staff_project_team_close(uuid, text) from public, anon;
grant execute on function public.staff_project_teams(), public.staff_project_team_close(uuid, text) to authenticated;
