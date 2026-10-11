-- Two public reads for the website.
--  * site_impact(): the live numbers on the home page and the sponsorship page (totals only, nothing
--    about any one person).
--  * verify_member(code): what someone scanning a membership card sees (/verify/member): the name on
--    the card and whether the membership is valid. Nothing else (no phone, no student code).
-- Both are rate-limited per address.

create or replace function public.site_impact()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not private.throttle('site_impact', 60, interval '10 minutes') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  return jsonb_build_object(
    'ok', true,
    'members', (select count(*) from public.students where active),
    'sessions', (select count(*) from public.attendance_sessions where starts_at < now()),
    'attendances', (select count(*) from public.attendance where status in ('present', 'late')),
    'certificates', (select count(*) from public.certificates where revoked_at is null),
    'projects', (select count(*) from public.site_content where kind = 'project' and published)
      + (select count(*) from public.student_projects where status = 'published' and site_content_id is null),
    'events', (select count(*) from public.site_content where kind = 'event' and published and starts_at < now()),
    'team', (select count(*) from public.team_profiles where published),
    'since', (select min(created_at)::date from public.students)
  );
end $$;
revoke all on function public.site_impact() from public;
grant execute on function public.site_impact() to anon, authenticated;

create or replace function public.verify_member(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_card text := private.card_of(p_code);
  v_st public.students%rowtype;
begin
  if not private.throttle('verify_member', 30, interval '10 minutes') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if v_card is null then
    return jsonb_build_object('ok', true, 'found', false);
  end if;
  select * into v_st from public.students where card_token = v_card;
  if v_st.id is null then
    return jsonb_build_object('ok', true, 'found', false);
  end if;
  return jsonb_build_object(
    'ok', true,
    'found', true,
    'name', v_st.full_name,
    'state', private.member_state(v_st),
    'until', v_st.member_until,
    'since', v_st.created_at::date,
    'banned', private.is_banned(null, v_st.id)
  );
end $$;
revoke all on function public.verify_member(text) from public;
grant execute on function public.verify_member(text) to anon, authenticated;
