-- Automatic WhatsApp for every moment that has a phone number on the other end.
--
-- Each moment is a row of private.wa_auto_rules: its section and place in the list, who gets it and
-- when (hint_ar), what its template's {{1}} {{2}}… are filled with (vars_ar), the approved template,
-- on/off, and since when it's on (enabled_at). A moment without a template sends nothing.
--
-- * Moments that answer one person's own step or a staff action on one record (application received,
--   interview date set, event registration…) start on when a matching approved template exists.
-- * Moments that reach many people at once (a new event to every student, the join waiting list when
--   applications open, session reminders to whole groups, absences) are marked bulk and start off;
--   the app asks before turning one on.
-- * Reminders never reach back in time: they only cover records made after the moment was turned on.
-- * Every message is sent once per person per moment and record; at most 800 automatic messages a
--   day go out, whatever happens.
-- * Applications get an interview date (interview_at): setting it sends the interview message,
--   changing it sends the new date, and the day before brings a reminder.
-- * A failed message can alert the owner's own number (at most once an hour).

-- ───────────────────────────────────────────── the moments
alter table private.wa_auto_rules
  add column if not exists section text not null default 'join',
  add column if not exists sort int not null default 0,
  add column if not exists hint_ar text,
  add column if not exists vars_ar text,
  add column if not exists bulk boolean not null default false,
  add column if not exists enabled_at timestamptz,
  add column if not exists to_phone text;
update private.wa_auto_rules set enabled_at = now() where enabled and enabled_at is null;

with m(key, section, sort, label_ar, hint_ar, vars_ar, template, enabled, bulk) as (values
  ('application_received', 'join', 10, 'استلام طلب الانضمام', 'أول ما حد يبعت فورم الانضمام', '{{1}} الاسم الأول · {{2}} كود الطلب', 'bx_application_received_v4', true, false),
  ('application_review', 'join', 20, 'الطلب بيتراجع', 'لما تخلي حالة الطلب «اتواصلنا»', '{{1}} الاسم الأول · {{2}} كود الطلب', 'bx_application_review_v4', true, false),
  ('application_interview', 'join', 30, 'ميعاد المقابلة', 'لما تحدد ميعاد المقابلة في الطلب', '{{1}} اليوم · {{2}} الساعة · {{3}} الاسم الأول', 'bx_interview_scheduled_v4', true, false),
  ('application_interview_moved', 'join', 40, 'تغيير ميعاد المقابلة', 'لما تغيّر ميعاد المقابلة', '{{1}} اليوم · {{2}} الساعة · {{3}} الاسم الأول', 'bx_interview_rescheduled_v4', true, false),
  ('application_interview_reminder', 'join', 50, 'تذكير بالمقابلة', 'قبل المقابلة بيوم (بين 10 الصبح و9 بالليل)', '{{1}} اليوم · {{2}} الساعة · {{3}} الاسم الأول', 'bx_interview_reminder_v4', true, false),
  ('application_waitlist', 'join', 60, 'الطلب في الانتظار', 'لما تخلي حالة الطلب «انتظار»', '{{1}} الاسم الأول · {{2}} كود الطلب', null, false, false),
  ('application_accepted', 'join', 70, 'قبول طلب الانضمام', 'لما تقبل الطلب', '{{1}} الاسم الأول · {{2}} المسار · {{3}} رقم العضوية', 'bx_application_accepted_v4', true, false),
  ('application_next_steps', 'join', 80, 'خطوات العضوية', 'بعد القبول بيوم', '{{1}} الاسم الأول · {{2}} رقم العضوية', 'bx_membership_next_steps_v4', true, false),
  ('application_rejected', 'join', 90, 'اعتذار عن طلب الانضمام', 'لما ترفض الطلب', '{{1}} الاسم الأول · {{2}} كود الطلب', 'bx_application_not_selected_v4', true, false),
  ('family_joined', 'family', 10, 'استلام تسجيل الأسرة', 'أول ما حد يسجّل في فورم الأسرة', '{{1}} الاسم الأول · {{2}} السنة', 'bx_application_received_v4', true, false),
  ('family_accepted', 'family', 20, 'قبول في الأسرة', 'لما تقبل تسجيل في الأسرة (مش اللي جاي من قبول طلب الانضمام)', '{{1}} الاسم الأول · {{2}} السنة', 'bx_application_accepted_v4', true, false),
  ('family_rejected', 'family', 30, 'رفض تسجيل الأسرة', 'لما ترفض تسجيل في الأسرة', '{{1}} الاسم الأول · {{2}} السنة', 'bx_application_not_selected_v4', true, false),
  ('event_registered', 'events', 10, 'تأكيد التسجيل في فعالية', 'أول ما حد يحجز مكانه في فعالية', '{{1}} اسم الفعالية · {{2}} اليوم · {{3}} الساعة · {{4}} الاسم الأول', 'bx_event_registration_confirmed_v4', true, false),
  ('event_waitlisted', 'events', 20, 'انتظار في فعالية', 'لما الأماكن تخلص ويتسجل في الانتظار', '{{1}} اسم الفعالية · {{2}} اليوم · {{3}} الساعة · {{4}} الاسم الأول', null, false, false),
  ('event_promoted', 'events', 30, 'مكانك اتأكد', 'لما يتنقل من الانتظار لمكان مؤكد', '{{1}} اسم الفعالية · {{2}} اليوم · {{3}} الساعة · {{4}} الاسم الأول', 'bx_event_registration_confirmed_v4', true, false),
  ('event_reminder', 'events', 40, 'تذكير بالفعالية', 'قبل الفعالية بيوم، للي حجزوا بعد ما الرسالة دي اتفتحت', '{{1}} اسم الفعالية · {{2}} اليوم · {{3}} الساعة · {{4}} الاسم الأول', 'bx_event_reminder_v4', true, false),
  ('event_published', 'events', 50, 'فعالية جديدة لكل الطلاب', 'لما تنشر فعالية جاية، لكل الطلاب اللي ليهم رقم', '{{1}} اسم الفعالية · {{2}} اليوم · {{3}} الساعة · {{4}} الاسم الأول', 'bx_workshop_announcement_v4', false, true),
  ('form_received', 'forms', 10, 'استلام فورم', 'أول ما حد يبعت أي فورم (غير فورم وفد المعرض، ليه رسايله)', '{{1}} اسم الفورم · {{2}} يوم أول موعد · {{3}} الساعة · {{4}} الاسم الأول', null, false, false),
  ('form_accepted', 'forms', 20, 'قبول في فورم', 'لما تقبل رد في فورم', '{{1}} اسم الفورم · {{2}} يوم أول موعد · {{3}} الساعة · {{4}} الاسم الأول', null, false, false),
  ('form_rejected', 'forms', 30, 'اعتذار في فورم', 'لما ترفض رد في فورم', '{{1}} اسم الفورم · {{2}} يوم أول موعد · {{3}} الساعة · {{4}} الاسم الأول', null, false, false),
  ('form_session_reminder', 'forms', 40, 'تذكير بموعد حضور', 'قبل كل موعد في «الحضور بالـ QR» بيوم، للي الموعد ليهم وسجلوا بعد ما الرسالة دي اتفتحت', '{{1}} الفورم والموعد · {{2}} اليوم · {{3}} الساعة · {{4}} الاسم الأول', 'bx_event_reminder_v4', true, false),
  ('session_reminder', 'students', 10, 'تذكير بالسيشن', 'قبل السيشن بيوم، لكل طلاب المجموعة', '{{1}} اسم السيشن · {{2}} اليوم · {{3}} الساعة · {{4}} الاسم الأول', 'bx_event_reminder_v4', false, true),
  ('student_absent', 'students', 20, 'غياب', 'لما الطالب يتسجل غايب في سيشن', '{{1}} الاسم الأول · {{2}} اسم السيشن · {{3}} اليوم', null, false, true),
  ('certificate_issued', 'students', 30, 'شهادة جديدة', 'لما تطلع شهادة لطالب', '{{1}} الاسم الأول · {{2}} اسم الشهادة · {{3}} كود التحقق', null, false, false),
  ('assignment_graded', 'students', 40, 'تصحيح تاسك', 'لما تاسك الطالب يتصحح', '{{1}} الاسم الأول · {{2}} اسم التاسك · {{3}} الدرجة', null, false, false),
  ('membership_expiring', 'students', 50, 'العضوية قربت تخلص', 'قبل نهاية العضوية بأسبوع', '{{1}} الاسم الأول · {{2}} يوم النهاية', null, false, false),
  ('loan_overdue', 'students', 60, 'حاجة من المخزن متأخرة', 'لما معاد رجوع حاجة استلفها طالب يعدّي', '{{1}} الاسم الأول · {{2}} الحاجة · {{3}} معاد الرجوع', null, false, false),
  ('inbox_received', 'site', 10, 'استلام رسالة التواصل', 'لما حد يبعت رسالة أو طلب رعاية وكاتب رقمه', '{{1}} الاسم الأول', null, false, false),
  ('join_open_waitlist', 'site', 20, 'التقديم فتح', 'لما تفتح التقديم، لكل اللي سجلوا «بلّغوني» في آخر 6 شهور', '{{1}} الاسم الأول', 'bx_community_invitation_v4', false, true),
  ('send_failed_alert', 'team', 10, 'تنبيه لما رسالة تفشل', 'لما ميتا ترفض رسالة، بيوصل تنبيه على الرقم ده (مرة في الساعة بالكتير)', '{{1}} آخر 4 أرقام من رقم المستلم · {{2}} كود الخطأ', 'bx_delivery_failure_alert_v4', false, false)
)
insert into private.wa_auto_rules as r (key, section, sort, label_ar, hint_ar, vars_ar, template, lang, enabled, bulk, enabled_at)
select m.key, m.section, m.sort, m.label_ar, m.hint_ar, m.vars_ar,
       case when private.wa_approved(m.template, 'ar') then m.template else '' end, 'ar',
       m.enabled and private.wa_approved(m.template, 'ar'), m.bulk,
       case when m.enabled and private.wa_approved(m.template, 'ar') then now() end
  from m
on conflict (key) do update set section = excluded.section, sort = excluded.sort, label_ar = excluded.label_ar,
  hint_ar = excluded.hint_ar, vars_ar = excluded.vars_ar, bulk = excluded.bulk;

-- ───────────────────────────────────────────── helpers
/** «الاثنين 20 أكتوبر» in Cairo. */
create or replace function private.wa_day(p timestamptz) returns text
language sql stable set search_path = '' as $$
  select case when p is null then '-' else
    (array['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'])[extract(dow from p at time zone 'Africa/Cairo')::int + 1]
    || ' ' || extract(day from p at time zone 'Africa/Cairo')::int || ' '
    || (array['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'])[extract(month from p at time zone 'Africa/Cairo')::int] end
$$;
/** «7:30 م» in Cairo. */
create or replace function private.wa_time(p timestamptz) returns text
language sql stable set search_path = '' as $$
  select case when p is null then '-' else
    (case when extract(hour from p at time zone 'Africa/Cairo')::int % 12 = 0 then 12 else extract(hour from p at time zone 'Africa/Cairo')::int % 12 end)::text
    || ':' || lpad(extract(minute from p at time zone 'Africa/Cairo')::int::text, 2, '0')
    || case when extract(hour from p at time zone 'Africa/Cairo')::int < 12 then ' ص' else ' م' end end
$$;
create or replace function private.wa_first(p_name text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(split_part(btrim(coalesce(p_name, '')), ' ', 1), ''), '-')
$$;
revoke execute on function private.wa_day(timestamptz), private.wa_time(timestamptz), private.wa_first(text) from public, anon, authenticated;

create index if not exists whatsapp_messages_to_ctx_idx on public.whatsapp_messages (to_phone, context);

/** One moment to one person. Never raises; once per person, moment and record; 800 a day at most. */
create or replace function private.wa_auto(p_key text, p_phone text, p_name text, p_params jsonb, p_context text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r private.wa_auto_rules;
  v_phone text := private.wa_phone(p_phone);
  v_ctx text := left(coalesce(p_context, ''), 90) || '#' || p_key;
  v_body text;
  v_params jsonb;
begin
  if v_phone is null then return; end if;
  select * into r from private.wa_auto_rules where key = p_key and enabled and template <> '';
  if not found then return; end if;
  if not exists (select 1 from private.whatsapp_account where id = 1 and status = 'ok') then return; end if;
  select t ->> 'body' into v_body from private.whatsapp_account a, jsonb_array_elements(a.templates) t
   where a.id = 1 and t ->> 'name' = r.template and t ->> 'language' = r.lang limit 1;
  if not found then return; end if;
  if exists (select 1 from public.whatsapp_messages
              where to_phone = v_phone and (context = v_ctx or (context = p_context and template = r.template))) then
    return;
  end if;
  if (select count(*) from public.whatsapp_messages where created_by is null and created_at > now() - interval '1 day') >= 800 then
    return;
  end if;
  select coalesce(jsonb_agg(coalesce(p_params -> (i - 1), '"-"'::jsonb) order by i), '[]'::jsonb)
    into v_params from generate_series(1, private.wa_vars(v_body)) i;
  perform private.wa_send(v_phone, p_name, null, r.template, r.lang, v_params, v_ctx, null);
exception when others then
  return;
end $$;
revoke all on function private.wa_auto(text, text, text, jsonb, text) from public, anon, authenticated;

/** When a moment was turned on (reminders don't reach back before it); null when it's off. */
create or replace function private.wa_since(p_key text) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select enabled_at from private.wa_auto_rules where key = p_key and enabled and template <> ''
$$;
revoke execute on function private.wa_since(text) from public, anon, authenticated;

-- ───────────────────────────────────────────── applications (+ interview date)
alter table public.applications
  add column if not exists interview_at timestamptz,
  add column if not exists interview_set_at timestamptz;
grant update (interview_at) on public.applications to authenticated;

create or replace function private.applications_interview_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.interview_at is distinct from old.interview_at then
    new.interview_set_at := case when new.interview_at is null then null else now() end;
  end if;
  return new;
end $$;
create or replace trigger applications_interview_touch before update of interview_at on public.applications
  for each row execute function private.applications_interview_touch();

create or replace function private.applications_wa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_first text := private.wa_first(new.full_name);
  v_ctx text := 'application:' || new.ref;
  v_track text;
  v_no text;
begin
  if tg_op = 'INSERT' then
    perform private.wa_auto('application_received', new.phone, new.full_name, jsonb_build_array(v_first, new.ref), v_ctx);
    return null;
  end if;
  if new.status is distinct from old.status then
    if new.status::text = 'contacted' then
      perform private.wa_auto('application_review', new.phone, new.full_name, jsonb_build_array(v_first, new.ref), v_ctx);
    elsif new.status::text = 'waitlist' then
      perform private.wa_auto('application_waitlist', new.phone, new.full_name, jsonb_build_array(v_first, new.ref), v_ctx);
    elsif new.status::text = 'accepted' then
      v_track := case new.track_first
        when 'robotics-embedded' then 'الروبوتات والأنظمة المدمجة'
        when 'ai-ml' then 'الذكاء الاصطناعي'
        when 'iot' then 'إنترنت الأشياء'
        when 'media-design' then 'الميديا والتصميم'
        when 'business' then 'الأعمال'
        else coalesce(nullif(new.track_first, ''), 'BuildX') end;
      select s.code into v_no from public.students s where s.id = new.student_id;
      perform private.wa_auto('application_accepted', new.phone, new.full_name,
        jsonb_build_array(v_first, v_track, coalesce(v_no, new.ref)), v_ctx);
    elsif new.status::text = 'rejected' then
      perform private.wa_auto('application_rejected', new.phone, new.full_name, jsonb_build_array(v_first, new.ref), v_ctx);
    end if;
  end if;
  if new.interview_at is distinct from old.interview_at and new.interview_at > now() then
    perform private.wa_auto(case when old.interview_at is null then 'application_interview' else 'application_interview_moved' end,
      new.phone, new.full_name,
      jsonb_build_array(private.wa_day(new.interview_at), private.wa_time(new.interview_at), v_first),
      v_ctx || ':interview:' || to_char(new.interview_at at time zone 'UTC', 'YYYYMMDDHH24MI'));
  end if;
  return null;
end $$;
create or replace trigger applications_wa after insert or update of status, interview_at on public.applications
  for each row execute function private.applications_wa();

-- ───────────────────────────────────────────── family list
create or replace function private.family_wa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_params jsonb := jsonb_build_array(private.wa_first(new.full_name), coalesce(new.academic_year, '-'));
begin
  -- Rows added by accepting an application come in accepted; that person already got the acceptance.
  if tg_op = 'INSERT' then
    if new.status = 'new' then
      perform private.wa_auto('family_joined', new.phone, new.full_name, v_params, 'family:' || new.ref);
    end if;
  elsif new.status is distinct from old.status and new.status in ('accepted', 'rejected') then
    perform private.wa_auto('family_' || new.status, new.phone, new.full_name, v_params, 'family:' || new.ref);
  end if;
  return null;
end $$;
create or replace trigger family_members_wa after insert or update of status on public.family_members
  for each row execute function private.family_wa();

-- ───────────────────────────────────────────── events
create or replace function private.event_registrations_wa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  e public.site_content;
  v_params jsonb;
begin
  select * into e from public.site_content where id = new.event_id;
  if not found then return null; end if;
  v_params := jsonb_build_array(coalesce(nullif(e.title_ar, ''), e.title), private.wa_day(e.starts_at), private.wa_time(e.starts_at), private.wa_first(new.full_name));
  if tg_op = 'INSERT' then
    if new.status = 'going' then
      perform private.wa_auto('event_registered', new.phone, new.full_name, v_params, 'event:' || new.id);
    elsif new.status = 'waitlist' then
      perform private.wa_auto('event_waitlisted', new.phone, new.full_name, v_params, 'event:' || new.id);
    end if;
  elsif old.status = 'waitlist' and new.status = 'going' then
    perform private.wa_auto('event_promoted', new.phone, new.full_name, v_params, 'event:' || new.id);
  end if;
  return null;
end $$;
create or replace trigger event_registrations_wa after insert or update of status on public.event_registrations
  for each row execute function private.event_registrations_wa();

create or replace function private.site_content_wa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  s record;
begin
  if new.kind::text <> 'event' or not new.published or new.starts_at is null or new.starts_at < now()
     or (tg_op = 'UPDATE' and old.published) or private.wa_since('event_published') is null then
    return null;
  end if;
  for s in select id, full_name, phone from public.students where active and phone is not null loop
    perform private.wa_auto('event_published', s.phone, s.full_name,
      jsonb_build_array(coalesce(nullif(new.title_ar, ''), new.title), private.wa_day(new.starts_at), private.wa_time(new.starts_at), private.wa_first(s.full_name)),
      'event-new:' || new.id);
  end loop;
  return null;
end $$;
create or replace trigger site_content_wa after insert or update of published on public.site_content
  for each row execute function private.site_content_wa();

-- ───────────────────────────────────────────── forms built in the app (not expo delegations)
/** The first session ahead that's for this response, if the form takes attendance. */
create or replace function private.form_next_session(p_attendance jsonb, p_answers jsonb) returns timestamptz
language sql stable set search_path = '' as $$
  select min((s ->> 'at')::timestamptz)
    from jsonb_array_elements(private.form_sessions(p_attendance)) s
   where coalesce(p_attendance ->> 'on', 'false') = 'true'
     and coalesce(s ->> 'at', '') ~ '^\d{4}-\d{2}-\d{2}'
     and (s ->> 'at')::timestamptz > now()
     and private.form_session_for(p_attendance, s, p_answers)
$$;
revoke execute on function private.form_next_session(jsonb, jsonb) from public, anon, authenticated;

create or replace function private.form_responses_wa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  f public.forms;
  v_next timestamptz;
  v_params jsonb;
begin
  select * into f from public.forms where id = new.form_id;
  if not found or f.delegation is not null then return null; end if;
  v_next := private.form_next_session(f.attendance, new.answers);
  v_params := jsonb_build_array(f.title_ar, private.wa_day(v_next), private.wa_time(v_next), private.wa_first(new.name));
  if tg_op = 'INSERT' then
    perform private.wa_auto('form_received', new.phone, new.name, v_params, 'form:' || new.id);
  elsif new.status is distinct from old.status and new.status in ('accepted', 'rejected') then
    perform private.wa_auto('form_' || new.status, new.phone, new.name, v_params, 'form:' || new.id);
  end if;
  return null;
exception when others then
  return null;
end $$;
create or replace trigger form_responses_wa after insert or update of status on public.form_responses
  for each row execute function private.form_responses_wa();

-- ───────────────────────────────────────────── students
create or replace function private.attendance_wa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  st public.students;
  se public.attendance_sessions;
begin
  if new.status::text <> 'absent' or (tg_op = 'UPDATE' and old.status::text = 'absent') then return null; end if;
  select * into st from public.students where id = new.student_id;
  select * into se from public.attendance_sessions where id = new.session_id;
  if st.id is null or se.id is null then return null; end if;
  perform private.wa_auto('student_absent', st.phone, st.full_name,
    jsonb_build_array(private.wa_first(st.full_name), se.title, private.wa_day(se.starts_at)), 'absent:' || se.id || ':' || st.id);
  return null;
end $$;
create or replace trigger attendance_wa after insert or update of status on public.attendance
  for each row execute function private.attendance_wa();

create or replace function private.certificates_wa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  st public.students;
begin
  if new.student_id is null or new.revoked_at is not null then return null; end if;
  select * into st from public.students where id = new.student_id;
  if st.id is null then return null; end if;
  perform private.wa_auto('certificate_issued', st.phone, st.full_name,
    jsonb_build_array(private.wa_first(st.full_name), coalesce(nullif(new.title_ar, ''), new.title), new.code), 'certificate:' || new.id);
  return null;
end $$;
create or replace trigger certificates_wa after insert on public.certificates
  for each row execute function private.certificates_wa();

create or replace function private.assignment_graded_wa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  st public.students;
  a public.assignments;
begin
  if new.graded_at is null or old.graded_at is not null then return null; end if;
  select * into st from public.students where id = new.student_id;
  select * into a from public.assignments where id = new.assignment_id;
  if st.id is null or a.id is null then return null; end if;
  perform private.wa_auto('assignment_graded', st.phone, st.full_name,
    jsonb_build_array(private.wa_first(st.full_name), a.title,
      coalesce(regexp_replace(regexp_replace(new.grade::text, '(\.\d*?)0+$', '\1'), '\.$', ''), '-') || coalesce(' من ' || a.max_points, '')),
    'graded:' || new.id);
  return null;
end $$;
create or replace trigger assignment_submissions_wa after update of graded_at on public.assignment_submissions
  for each row execute function private.assignment_graded_wa();

-- ───────────────────────────────────────────── website
create or replace function private.inbox_wa()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.phone is not null then
    perform private.wa_auto('inbox_received', new.phone, new.name, jsonb_build_array(private.wa_first(new.name)), 'inbox:' || new.id);
  end if;
  return null;
end $$;
create or replace trigger inbox_messages_wa after insert on public.inbox_messages
  for each row execute function private.inbox_wa();

create or replace function private.site_settings_wa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  w record;
begin
  if new.key <> 'applications' or coalesce(new.value ->> 'open', 'false') <> 'true'
     or (tg_op = 'UPDATE' and coalesce(old.value ->> 'open', 'false') = 'true')
     or private.wa_since('join_open_waitlist') is null then
    return null;
  end if;
  for w in select id, name, phone from public.waitlist
            where kind = 'applications' and notified_at is null and phone is not null and created_at > now() - interval '180 days' loop
    perform private.wa_auto('join_open_waitlist', w.phone, w.name, jsonb_build_array(private.wa_first(w.name)), 'waitlist:' || w.id);
  end loop;
  return null;
end $$;
create or replace trigger site_settings_wa after insert or update on public.site_settings
  for each row execute function private.site_settings_wa();

-- ───────────────────────────────────────────── on a clock: reminders and follow-ups
create or replace function private.wa_auto_tick(p_any_hour boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_hour int := case when p_any_hour then 12 else extract(hour from now() at time zone 'Africa/Cairo')::int end;
  v_since timestamptz;
  x record;
begin
  if not exists (select 1 from private.whatsapp_account where id = 1 and status = 'ok') then return; end if;

  -- Follow-ups the day after acceptance.
  v_since := private.wa_since('application_next_steps');
  if v_since is not null and v_hour between 10 and 20 then
    for x in select a.ref, a.full_name, a.phone, s.code from public.applications a left join public.students s on s.id = a.student_id
              where a.status::text = 'accepted' and a.reviewed_at >= v_since
                and a.reviewed_at < now() - interval '20 hours' and a.reviewed_at > now() - interval '3 days' loop
      perform private.wa_auto('application_next_steps', x.phone, x.full_name,
        jsonb_build_array(private.wa_first(x.full_name), coalesce(x.code, x.ref)), 'application:' || x.ref);
    end loop;
  end if;

  -- The rest are reminders: only in the daytime.
  if v_hour < 10 or v_hour > 20 then return; end if;

  v_since := private.wa_since('application_interview_reminder');
  if v_since is not null then
    for x in select ref, full_name, phone, interview_at from public.applications
              where interview_at between now() + interval '2 hours' and now() + interval '26 hours'
                and interview_set_at >= v_since and status::text not in ('accepted', 'rejected') loop
      perform private.wa_auto('application_interview_reminder', x.phone, x.full_name,
        jsonb_build_array(private.wa_day(x.interview_at), private.wa_time(x.interview_at), private.wa_first(x.full_name)),
        'application:' || x.ref || ':interview:' || to_char(x.interview_at at time zone 'UTC', 'YYYYMMDDHH24MI'));
    end loop;
  end if;

  v_since := private.wa_since('event_reminder');
  if v_since is not null then
    for x in select r.id, r.full_name, r.phone, e.title, e.title_ar, e.starts_at
               from public.event_registrations r join public.site_content e on e.id = r.event_id
              where r.status = 'going' and r.created_at >= v_since
                and e.starts_at between now() + interval '2 hours' and now() + interval '26 hours' loop
      perform private.wa_auto('event_reminder', x.phone, x.full_name,
        jsonb_build_array(coalesce(nullif(x.title_ar, ''), x.title), private.wa_day(x.starts_at), private.wa_time(x.starts_at), private.wa_first(x.full_name)),
        'event:' || x.id);
    end loop;
  end if;

  v_since := private.wa_since('form_session_reminder');
  if v_since is not null then
    for x in select r.id, r.name, r.phone, f.title_ar, s ->> 'id' as sid, s ->> 'name' as sname, (s ->> 'at')::timestamptz as at
               from public.forms f
               cross join lateral jsonb_array_elements(private.form_sessions(f.attendance)) s
               join public.form_responses r on r.form_id = f.id
              where coalesce(f.attendance ->> 'on', 'false') = 'true' and not coalesce(f.archived, false)
                and coalesce(s ->> 'at', '') ~ '^\d{4}-\d{2}-\d{2}'
                and (s ->> 'at')::timestamptz between now() + interval '2 hours' and now() + interval '26 hours'
                and r.status <> 'rejected' and r.created_at >= v_since
                and private.form_session_for(f.attendance, s, r.answers) loop
      perform private.wa_auto('form_session_reminder', x.phone, x.name,
        jsonb_build_array(x.title_ar || ' — ' || x.sname, private.wa_day(x.at), private.wa_time(x.at), private.wa_first(x.name)),
        'form:' || x.id || ':session:' || x.sid);
    end loop;
  end if;

  v_since := private.wa_since('session_reminder');
  if v_since is not null then
    for x in select se.id as sid, se.title, se.starts_at, st.id, st.full_name, st.phone
               from public.attendance_sessions se
               join public.students st on st.active and st.phone is not null and (se.group_name is null or st.group_name = se.group_name)
              where se.closed_at is null and se.created_at >= v_since
                and se.starts_at between now() + interval '2 hours' and now() + interval '26 hours' loop
      perform private.wa_auto('session_reminder', x.phone, x.full_name,
        jsonb_build_array(x.title, private.wa_day(x.starts_at), private.wa_time(x.starts_at), private.wa_first(x.full_name)),
        'session:' || x.sid || ':' || x.id);
    end loop;
  end if;

  v_since := private.wa_since('membership_expiring');
  if v_since is not null then
    for x in select id, full_name, phone, member_until from public.students
              where active and phone is not null and member_until between current_date and current_date + 7
                and (member_until - 7)::timestamptz >= date_trunc('day', v_since) loop
      perform private.wa_auto('membership_expiring', x.phone, x.full_name,
        jsonb_build_array(private.wa_first(x.full_name), private.wa_day((x.member_until + time '12:00') at time zone 'Africa/Cairo')),
        'member:' || x.id || ':' || x.member_until);
    end loop;
  end if;

  v_since := private.wa_since('loan_overdue');
  if v_since is not null then
    for x in select l.id, l.due_at, i.name as item, st.full_name, st.phone
               from public.inventory_loans l join public.inventory_items i on i.id = l.item_id join public.students st on st.id = l.student_id
              where l.status = 'out' and l.due_at < now() and l.due_at >= v_since loop
      perform private.wa_auto('loan_overdue', x.phone, x.full_name,
        jsonb_build_array(private.wa_first(x.full_name), x.item, private.wa_day(x.due_at)), 'loan:' || x.id);
    end loop;
  end if;
end $$;
revoke all on function private.wa_auto_tick(boolean) from public, anon, authenticated;

select cron.schedule('whatsapp-auto', '*/15 * * * *', 'select private.wa_auto_tick()');

-- ───────────────────────────────────────────── failed messages alert the owner
create or replace function private.wa_failed_alert()
returns void language plpgsql security definer set search_path = '' as $$
declare
  r private.wa_auto_rules;
  m record;
begin
  select * into r from private.wa_auto_rules where key = 'send_failed_alert' and enabled and to_phone is not null;
  if not found then return; end if;
  select to_phone, error into m from public.whatsapp_messages
   where status = 'failed' and created_at > now() - interval '30 minutes' and coalesce(context, '') not like 'alert:%'
   order by created_at desc limit 1;
  if not found then return; end if;
  perform private.wa_auto('send_failed_alert', r.to_phone, null,
    jsonb_build_array(right(m.to_phone, 4), coalesce(substring(m.error from '#(\d+)'), 'other')),
    'alert:' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24'));
end $$;
revoke all on function private.wa_failed_alert() from public, anon, authenticated;
select cron.schedule('whatsapp-failed-alert', '*/10 * * * *', 'select private.wa_failed_alert()');

-- ───────────────────────────────────────────── the app
create or replace function public.staff_wa_auto_rules()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not (private.can_read('whatsapp') or private.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'key', r.key, 'section', r.section, 'label_ar', r.label_ar, 'hint_ar', r.hint_ar, 'vars_ar', r.vars_ar,
      'template', nullif(r.template, ''), 'lang', r.lang, 'enabled', r.enabled, 'bulk', r.bulk, 'to_phone', r.to_phone,
      'ok', private.wa_approved(r.template, r.lang),
      'audience', case r.key
        when 'event_published' then (select count(*) from public.students where active and phone is not null)
        when 'session_reminder' then (select count(*) from public.students where active and phone is not null)
        when 'join_open_waitlist' then (select count(*) from public.waitlist where kind = 'applications' and notified_at is null and phone is not null and created_at > now() - interval '180 days')
        end,
      'sent', (select count(*) from public.whatsapp_messages m where m.context like '%#' || r.key and m.status = 'sent'))
    order by array_position(array['join', 'family', 'events', 'forms', 'students', 'site', 'team'], r.section), r.sort)
    from private.wa_auto_rules r), '[]'::jsonb);
end $$;

create or replace function public.staff_wa_auto_set(p_key text, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (private.can('whatsapp') or private.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_enabled and exists (select 1 from private.wa_auto_rules where key = p_key and template = '') then
    raise exception 'no_template' using errcode = 'P0001';
  end if;
  if p_enabled and p_key = 'send_failed_alert' and exists (select 1 from private.wa_auto_rules where key = p_key and to_phone is null) then
    raise exception 'no_phone' using errcode = 'P0001';
  end if;
  update private.wa_auto_rules
     set enabled = p_enabled, enabled_at = case when p_enabled and not enabled then now() when p_enabled then enabled_at end
   where key = p_key;
end $$;

create or replace function public.staff_wa_auto_template(p_key text, p_template text, p_lang text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (private.can('whatsapp') or private.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_template is not null and not private.wa_approved(p_template, p_lang) then
    raise exception 'unknown_template' using errcode = 'P0001';
  end if;
  update private.wa_auto_rules
     set template = coalesce(p_template, ''), lang = coalesce(p_lang, lang), enabled = enabled and p_template is not null
   where key = p_key;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end $$;

create or replace function public.staff_wa_auto_phone(p_key text, p_phone text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := private.wa_phone(p_phone);
begin
  if not (private.can('whatsapp') or private.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_key <> 'send_failed_alert' then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_phone is not null and btrim(p_phone) <> '' and v_phone is null then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;
  update private.wa_auto_rules set to_phone = v_phone, enabled = enabled and v_phone is not null where key = p_key;
end $$;
revoke all on function public.staff_wa_auto_phone(text, text) from public, anon;
grant execute on function public.staff_wa_auto_phone(text, text) to authenticated;
