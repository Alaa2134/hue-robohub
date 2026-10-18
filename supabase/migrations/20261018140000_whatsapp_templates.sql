-- Our own WhatsApp templates for every moment on the site, sent to Meta from here.
--
-- private.wa_templates is the catalog: each template's text, its example values and the moments that
-- use it. private.wa_templates_submit() sends the ones Meta does not have yet; Meta's answer (id,
-- status, rejection reason) is written back by the 10-minute job, which also re-reads the approved
-- list while any template is still under review.
--
-- Each moment now has a preferred template and fallbacks (wa_auto_rules.alts): wa_auto sends the first
-- one that is approved and has every value filled, so a moment keeps using today's v4 template while
-- its new one is being reviewed and switches by itself once Meta approves it.

create table if not exists private.wa_templates (
  name text primary key check (name ~ '^[a-z0-9_]+$' and char_length(name) <= 512),
  lang text not null default 'ar',
  category text not null check (category in ('UTILITY', 'MARKETING')),
  body text not null check (char_length(body) <= 1024),
  example text[] not null default '{}',
  moments text[] not null default '{}',
  submit_request bigint,
  submitted_at timestamptz,
  meta_id text,
  meta_status text,
  meta_category text,
  meta_error text,
  checked_at timestamptz
);
alter table private.wa_templates enable row level security;
revoke all on private.wa_templates from public, anon, authenticated;

insert into private.wa_templates (name, category, moments, example, body) values
-- join applications: [first name, application code] · interviews: [day, time, first name]
('bx_join_received_v5', 'UTILITY', '{application_received}', '{أحمد,BX-482913}',
'أهلًا {{1}}، استلمنا طلب انضمامك لأسرة BuildX HUE ✅
كود طلبك: {{2}}
تقدر تتابع حالة طلبك في أي وقت من buildxhue.com/ar/join/status وهنبلغك هنا أول ما تتحدث.'),
('bx_join_review_v5', 'UTILITY', '{application_review}', '{أحمد,BX-482913}',
'أهلًا {{1}}، طلبك في أسرة BuildX HUE (كود {{2}}) دلوقتي تحت المراجعة. هنبلغك هنا أول ما يبقى فيه جديد، وتقدر تتابعه من buildxhue.com/ar/join/status'),
('bx_join_waitlist_v5', 'UTILITY', '{application_waitlist}', '{أحمد,BX-482913}',
'أهلًا {{1}}، طلبك في أسرة BuildX HUE (كود {{2}}) اتحط في قائمة الانتظار. أول ما يفضى مكان هنبلغك هنا على طول، وتقدر تتابعه من buildxhue.com/ar/join/status'),
('bx_interview_set_v5', 'UTILITY', '{application_interview}', '{"الاثنين 19 أكتوبر","12:30 م",أحمد}',
'تم تحديد موعد مقابلتك مع أسرة BuildX HUE يوم {{1}} الساعة {{2}}. مستنيينك يا {{3}}، ولو مش هتقدر تحضر بلّغنا قبلها برد على الرسالة دي.'),
('bx_interview_moved_v5', 'UTILITY', '{application_interview_moved}', '{"الثلاثاء 20 أكتوبر","2:00 م",أحمد}',
'اتغيّر موعد مقابلتك مع أسرة BuildX HUE، والموعد الجديد يوم {{1}} الساعة {{2}}. مستنيينك يا {{3}}، ولو الموعد مش مناسب رد على الرسالة دي.'),
('bx_interview_reminder_v5', 'UTILITY', '{application_interview_reminder}', '{"الاثنين 19 أكتوبر","12:30 م",أحمد}',
'تذكير بموعد مقابلتك مع أسرة BuildX HUE يوم {{1}} الساعة {{2}}. مستنيينك يا {{3}}، ولو حصل أي ظرف بلّغنا برد على الرسالة دي.'),
('bx_join_accepted_v5', 'UTILITY', '{application_accepted}', '{أحمد,"Embedded Systems",BX-042}',
'مبروك يا {{1}} 🎉 تم قبولك في أسرة BuildX HUE في مسار {{2}}.
رقم عضويتك: {{3}}
هنبعتلك الخطوات الجاية هنا قريب، وتفاصيل قبولك موجودة في buildxhue.com/ar/join/status'),
('bx_join_next_steps_v5', 'UTILITY', '{application_next_steps}', '{أحمد,BX-042}',
'أهلًا {{1}}، علشان تكمّل عضويتك في أسرة BuildX HUE (رقم {{2}}) ادخل على صفحة الأسرة buildxhue.com/ar/family وتابع التعليمات، ولو عندك أي سؤال رد على الرسالة دي.'),
('bx_join_not_selected_v5', 'UTILITY', '{application_rejected}', '{أحمد,BX-482913}',
'أهلًا {{1}}، شكرًا على اهتمامك بالانضمام لأسرة BuildX HUE. للأسف مقدرناش نقبل طلبك (كود {{2}}) في المرحلة دي، ونتمنالك كل التوفيق.'),
-- family list: [first name]
('bx_family_received_v5', 'UTILITY', '{family_joined}', '{أحمد}',
'أهلًا {{1}}، استلمنا تسجيلك في كشف أسرة BuildX HUE ✅ هنراجع بياناتك ونبلغك هنا أول ما يتم اعتمادها.'),
('bx_family_accepted_v5', 'UTILITY', '{family_accepted}', '{أحمد}',
'أهلًا {{1}}، تم اعتماد تسجيلك في كشف أسرة BuildX HUE ✅ تقدر تشوف بيانات عضويتك من صفحة الأسرة buildxhue.com/ar/family'),
('bx_family_not_accepted_v5', 'UTILITY', '{family_rejected}', '{أحمد}',
'أهلًا {{1}}، راجعنا تسجيلك في كشف أسرة BuildX HUE ومقدرناش نعتمده حاليًا. لو محتاج تعرف السبب أو تعدّل بياناتك رد على الرسالة دي.'),
-- events: [event, day, time]
('bx_event_booked_v5', 'UTILITY', '{event_registered}', '{"Arduino Workshop","الاثنين 19 أكتوبر","12:30 م"}',
'تم تأكيد حجزك في {{1}} من BuildX HUE ✅
الموعد: {{2}} الساعة {{3}}
تذكرتك (QR) موجودة على الموقع، وهنفكرك قبلها بيوم.'),
('bx_event_waitlist_v5', 'UTILITY', '{event_waitlisted}', '{"Arduino Workshop","الاثنين 19 أكتوبر","12:30 م"}',
'الأماكن في {{1}} من BuildX HUE (يوم {{2}} الساعة {{3}}) اكتملت، وأنت دلوقتي في قائمة الانتظار. لو فضي مكان هنأكدلك حجزك هنا على طول.'),
('bx_event_promoted_v5', 'UTILITY', '{event_promoted}', '{"Arduino Workshop","الاثنين 19 أكتوبر","12:30 م"}',
'خبر حلو 🎉 فضي مكان في {{1}} من BuildX HUE وتم تأكيد حجزك.
الموعد: {{2}} الساعة {{3}}
تذكرتك (QR) موجودة على الموقع.'),
('bx_event_reminder_v5', 'UTILITY', '{event_reminder}', '{"Arduino Workshop","الاثنين 19 أكتوبر","12:30 م"}',
'تذكير بحجزك في {{1}} من BuildX HUE يوم {{2}} الساعة {{3}}. خلي تذكرتك (QR) جاهزة على موبايلك، ومستنيينك!'),
('bx_event_new_v5', 'MARKETING', '{event_published}', '{"Arduino Workshop","الاثنين 19 أكتوبر","12:30 م"}',
'فعالية جديدة من BuildX HUE 🚀
{{1}} يوم {{2}} الساعة {{3}}.
احجز مكانك من buildxhue.com/ar/events قبل ما الأماكن تخلص.
لإيقاف الرسائل دي رد بكلمة إيقاف.'),
-- forms: [form, day, time]
('bx_form_received_v5', 'UTILITY', '{form_received}', '{"Workshop 01 – Embedded Systems"}',
'استلمنا ردك على «{{1}}» من BuildX HUE ✅ هنراجعه ونبلغك هنا أول ما حالته تتحدث.'),
('bx_form_accepted_date_v5', 'UTILITY', '{form_accepted}', '{"Workshop 01 – Embedded Systems","الاثنين 19 أكتوبر","12:30 م"}',
'مبروك 🎉 تم قبولك في «{{1}}» من BuildX HUE.
الموعد: {{2}} الساعة {{3}}
التفاصيل وأي خطوة مطلوبة منك موجودة في صفحة متابعة طلبك على الموقع.'),
('bx_form_accepted_v5', 'UTILITY', '{form_accepted}', '{"Workshop 01 – Embedded Systems"}',
'مبروك 🎉 تم قبولك في «{{1}}» من BuildX HUE. التفاصيل وأي خطوة مطلوبة منك موجودة في صفحة متابعة طلبك على الموقع.'),
('bx_form_not_accepted_v5', 'UTILITY', '{form_rejected}', '{"Workshop 01 – Embedded Systems"}',
'شكرًا على اهتمامك بـ «{{1}}» من BuildX HUE. للأسف مقدرناش نقبل ردك المرة دي، ونتمنالك كل التوفيق.'),
('bx_form_session_reminder_v5', 'UTILITY', '{form_session_reminder}', '{"Workshop 01 — اليوم الأول","الاثنين 19 أكتوبر","12:30 م"}',
'تذكير بموعدك في {{1}} من BuildX HUE يوم {{2}} الساعة {{3}}. خلي الـ QR بتاعك جاهز علشان تسجيل الحضور.'),
-- students
('bx_session_reminder_v5', 'UTILITY', '{session_reminder}', '{"Arduino 03","الاثنين 19 أكتوبر","12:30 م"}',
'تذكير من BuildX HUE: سيشن {{1}} يوم {{2}} الساعة {{3}}. مستنيينك، ومتنساش تسجل حضورك بالـ QR.'),
('bx_student_absent_v5', 'UTILITY', '{student_absent}', '{أحمد,"Arduino 03","الاثنين 19 أكتوبر"}',
'أهلًا {{1}}، اتسجلت غياب في سيشن {{2}} يوم {{3}}. لو كان عندك عذر بلّغ المشرف بتاعك أو رد على الرسالة دي.'),
('bx_certificate_ready_v5', 'UTILITY', '{certificate_issued}', '{أحمد,"Embedded Systems Bootcamp",BXC-3F9A21C7}',
'مبروك يا {{1}} 🎓 شهادتك «{{2}}» من BuildX HUE جاهزة.
كود التحقق: {{3}}
تقدر تشوفها وتنزّلها من التطبيق، وأي حد يقدر يتحقق منها على buildxhue.com/ar/verify'),
('bx_assignment_graded_v5', 'UTILITY', '{assignment_graded}', '{أحمد,"Line Follower",9/10}',
'أهلًا {{1}}، تم تصحيح تاسك «{{2}}» ودرجتك {{3}}. تفاصيل التصحيح وملاحظات المشرف موجودة في التطبيق.'),
('bx_membership_expiring_v5', 'UTILITY', '{membership_expiring}', '{أحمد,"الأحد 25 أكتوبر"}',
'أهلًا {{1}}، عضويتك في BuildX HUE هتنتهي يوم {{2}}. جدّدها من التطبيق أو كلّم المشرف علشان متفوتكش السيشنات والفعاليات.'),
('bx_loan_overdue_v5', 'UTILITY', '{loan_overdue}', '{أحمد,"Arduino Uno","الخميس 15 أكتوبر"}',
'أهلًا {{1}}، ميعاد رجوع «{{2}}» اللي استلفته من مخزن BuildX HUE كان يوم {{3}}. ياريت ترجّعه في أقرب وقت، ولو محتاج تمديد رد على الرسالة دي.'),
-- website
('bx_message_received_v5', 'UTILITY', '{inbox_received}', '{أحمد}',
'أهلًا {{1}}، استلمنا رسالتك لـ BuildX HUE ✅ هنرد عليك في أقرب وقت، ولو حابب تضيف أي تفاصيل رد على الرسالة دي.'),
('bx_join_open_v5', 'MARKETING', '{join_open_waitlist}', '{أحمد}',
'أهلًا {{1}}، التقديم في أسرة BuildX HUE فتح دلوقتي زي ما طلبت نبلغك 🚀 قدّم من buildxhue.com/ar/join قبل ما الأماكن تخلص.
لإيقاف الرسائل دي رد بكلمة إيقاف.'),
-- expo delegation (private.expo_wa): [first name, day]
('bx_expo_accepted_v5', 'UTILITY', '{expo:accept_template}', '{أحمد,"14–16 November 2026"}',
'أهلًا {{1}}، تم قبولك في وفد BuildX HUE لزيارة المعرض يوم {{2}} ✅ الباس (QR) وتفاصيل التجمع موجودين في صفحة طلبك على الموقع، وهنفكرك قبلها بيوم.'),
('bx_expo_reminder_v5', 'UTILITY', '{expo:remind_template}', '{أحمد,"14–16 November 2026"}',
'أهلًا {{1}}، تذكير بزيارة المعرض مع وفد BuildX HUE يوم {{2}}. خلي الباس (QR) والكارنيه معاك، ولو مش هتقدر تيجي بلّغنا برد على الرسالة دي.')
on conflict (name) do update set category = excluded.category, moments = excluded.moments, example = excluded.example, body = excluded.body
 where private.wa_templates.meta_id is null;

-- ───────────────────────────────────────────── preferred template + fallbacks per moment
alter table private.wa_auto_rules add column if not exists alts text[] not null default '{}';

update private.wa_auto_rules r set template = m.tpl, alts = m.alts, lang = 'ar'
  from (values
    ('application_received', 'bx_join_received_v5', '{bx_application_received_v4}'::text[]),
    ('application_review', 'bx_join_review_v5', '{bx_application_review_v4}'),
    ('application_waitlist', 'bx_join_waitlist_v5', '{}'),
    ('application_interview', 'bx_interview_set_v5', '{bx_interview_scheduled_v4}'),
    ('application_interview_moved', 'bx_interview_moved_v5', '{bx_interview_rescheduled_v4}'),
    ('application_interview_reminder', 'bx_interview_reminder_v5', '{bx_interview_reminder_v4}'),
    ('application_accepted', 'bx_join_accepted_v5', '{bx_application_accepted_v4}'),
    ('application_next_steps', 'bx_join_next_steps_v5', '{bx_membership_next_steps_v4}'),
    ('application_rejected', 'bx_join_not_selected_v5', '{bx_application_not_selected_v4}'),
    ('family_joined', 'bx_family_received_v5', '{bx_application_received_v4}'),
    ('family_accepted', 'bx_family_accepted_v5', '{bx_application_accepted_v4}'),
    ('family_rejected', 'bx_family_not_accepted_v5', '{bx_application_not_selected_v4}'),
    ('event_registered', 'bx_event_booked_v5', '{bx_event_registration_confirmed_v4}'),
    ('event_waitlisted', 'bx_event_waitlist_v5', '{}'),
    ('event_promoted', 'bx_event_promoted_v5', '{bx_event_registration_confirmed_v4}'),
    ('event_reminder', 'bx_event_reminder_v5', '{bx_event_reminder_v4}'),
    ('event_published', 'bx_event_new_v5', '{bx_workshop_announcement_v4}'),
    ('form_received', 'bx_form_received_v5', '{}'),
    ('form_accepted', 'bx_form_accepted_date_v5', '{bx_form_accepted_v5,bx_event_registration_confirmed_v4}'),
    ('form_rejected', 'bx_form_not_accepted_v5', '{}'),
    ('form_session_reminder', 'bx_form_session_reminder_v5', '{bx_event_reminder_v4}'),
    ('session_reminder', 'bx_session_reminder_v5', '{bx_event_reminder_v4}'),
    ('student_absent', 'bx_student_absent_v5', '{}'),
    ('certificate_issued', 'bx_certificate_ready_v5', '{}'),
    ('assignment_graded', 'bx_assignment_graded_v5', '{}'),
    ('membership_expiring', 'bx_membership_expiring_v5', '{}'),
    ('loan_overdue', 'bx_loan_overdue_v5', '{}'),
    ('inbox_received', 'bx_message_received_v5', '{}'),
    ('join_open_waitlist', 'bx_join_open_v5', '{bx_community_invitation_v4}')
  ) as m(key, tpl, alts)
 where r.key = m.key;

-- Every moment that goes to one person at a time is on; the ones that reach many people at once stay
-- off until turned on from the app (which shows how many). Reminders only cover records made from now.
update private.wa_auto_rules set enabled = true, enabled_at = coalesce(enabled_at, now())
 where not bulk and not enabled and key <> 'send_failed_alert';

create or replace function private.wa_auto(p_key text, p_phone text, p_name text, p_params jsonb, p_context text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r private.wa_auto_rules;
  v_phone text := private.wa_phone(p_phone);
  v_ctx text := left(coalesce(p_context, ''), 90) || '#' || p_key;
  v_tpls text[];
  v_tpl text;
  v_body text;
  v_params jsonb;
begin
  if v_phone is null then return; end if;
  select * into r from private.wa_auto_rules where key = p_key and enabled;
  if not found then return; end if;
  v_tpls := array_remove(array[r.template] || r.alts, '');
  if cardinality(v_tpls) = 0 then return; end if;
  if not exists (select 1 from private.whatsapp_account where id = 1 and status = 'ok') then return; end if;
  if exists (select 1 from public.whatsapp_messages
              where to_phone = v_phone and (context = v_ctx or (context = p_context and template = any (v_tpls)))) then
    return;
  end if;
  if (select count(*) from public.whatsapp_messages where created_by is null and created_at > now() - interval '1 day') >= 800 then
    return;
  end if;
  foreach v_tpl in array v_tpls loop
    v_body := null;
    select t ->> 'body' into v_body from private.whatsapp_account a, jsonb_array_elements(a.templates) t
     where a.id = 1 and t ->> 'name' = v_tpl and t ->> 'language' = r.lang limit 1;
    continue when v_body is null;
    select coalesce(jsonb_agg(coalesce(p_params -> (i - 1), '"-"'::jsonb) order by i), '[]'::jsonb)
      into v_params from generate_series(1, private.wa_vars(v_body)) i;
    continue when exists (select 1 from jsonb_array_elements_text(v_params) x where btrim(coalesce(x, '')) in ('', '-'));
    perform private.wa_send(v_phone, p_name, null, v_tpl, r.lang, v_params, v_ctx, null);
    return;
  end loop;
exception when others then
  return;
end $$;

-- The template a moment sends right now: its preferred one if approved, else the first approved fallback.
create or replace function private.wa_auto_current(r private.wa_auto_rules)
returns text language sql stable set search_path = '' as $$
  select c from unnest(array_remove(array[r.template] || r.alts, '')) with ordinality u(c, o)
   where private.wa_approved(c, r.lang) order by o limit 1
$$;

create or replace function public.staff_wa_auto_rules()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not (private.can_read('whatsapp') or private.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'key', r.key, 'section', r.section, 'label_ar', r.label_ar, 'hint_ar', r.hint_ar, 'vars_ar', r.vars_ar,
      'template', coalesce(private.wa_auto_current(r), nullif(r.template, '')), 'lang', r.lang, 'enabled', r.enabled,
      'bulk', r.bulk, 'to_phone', r.to_phone,
      'ok', private.wa_auto_current(r) is not null,
      'waiting', case when r.template <> '' and not private.wa_approved(r.template, r.lang) then r.template end,
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
  if p_enabled and exists (select 1 from private.wa_auto_rules where key = p_key and template = '' and alts = '{}') then
    raise exception 'no_template' using errcode = 'P0001';
  end if;
  if p_enabled and p_key = 'send_failed_alert' and exists (select 1 from private.wa_auto_rules where key = p_key and to_phone is null) then
    raise exception 'no_phone' using errcode = 'P0001';
  end if;
  update private.wa_auto_rules
     set enabled = p_enabled, enabled_at = case when p_enabled and not enabled then now() when p_enabled then enabled_at end
   where key = p_key;
end $$;

-- Picking a template in the app is final: it replaces the preferred one and its fallbacks.
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
     set template = coalesce(p_template, ''), alts = '{}', lang = coalesce(p_lang, lang), enabled = enabled and p_template is not null
   where key = p_key;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end $$;

-- ───────────────────────────────────────────── expo delegation: only approved templates
create or replace function private.expo_wa(p_form public.forms, p_r public.form_responses, p_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_tpl text := p_form.delegation ->> p_key;
  v_name text;
  v_lang text;
  v_body text;
  v_n int;
  v_phone text := private.wa_phone(p_r.phone);
  v_vals text[];
begin
  if v_tpl is null or v_tpl !~ '^[a-z0-9_]+\|[A-Za-z_]{2,6}$' or v_phone is null
     or not exists (select 1 from private.whatsapp_account where id = 1 and status = 'ok') then
    return false;
  end if;
  v_name := split_part(v_tpl, '|', 1);
  v_lang := split_part(v_tpl, '|', 2);
  select t ->> 'body' into v_body from private.whatsapp_account a, jsonb_array_elements(a.templates) t
   where a.id = 1 and t ->> 'name' = v_name and t ->> 'language' = v_lang limit 1;
  if not found then
    return false;
  end if;
  v_n := least(5, coalesce((select max((m[1])::int) from regexp_matches(coalesce(v_body, ''), '\{\{([0-9]+)\}\}', 'g') m), 0));
  v_vals := array[
    coalesce(nullif(split_part(btrim(coalesce(p_r.name, '')), ' ', 1), ''), '-'),
    coalesce(nullif(p_r.answers ->> 'day', ''), nullif(p_form.delegation ->> 'dates', ''), '-'),
    coalesce(nullif(p_form.delegation ->> 'meet_ar', ''), '-'),
    case when p_r.member_no is null then '-' else 'BX-' || lpad(p_r.member_no::text, 3, '0') end,
    coalesce(nullif(p_form.delegation ->> 'event', ''), p_form.title_ar)];
  perform private.wa_send(v_phone, p_r.name, null, v_name, v_lang, coalesce(to_jsonb(v_vals[1:v_n]), '[]'::jsonb), 'expo:' || p_form.id, null);
  return true;
exception when others then
  return false;
end $$;

update public.forms
   set delegation = delegation
       || case when coalesce(delegation ->> 'accept_template', '') = '' then '{"accept_template": "bx_expo_accepted_v5|ar"}'::jsonb else '{}'::jsonb end
       || case when coalesce(delegation ->> 'remind_template', '') = '' then '{"remind_template": "bx_expo_reminder_v5|ar"}'::jsonb else '{}'::jsonb end
 where delegation is not null and jsonb_typeof(delegation) = 'object'
   and (coalesce(delegation ->> 'accept_template', '') = '' or coalesce(delegation ->> 'remind_template', '') = '');

-- ───────────────────────────────────────────── sending the catalog to Meta
create or replace function private.wa_templates_submit()
returns int language plpgsql security definer set search_path = '' as $$
declare
  a private.whatsapp_account;
  t private.wa_templates;
  n int := 0;
begin
  select * into a from private.whatsapp_account where id = 1 and status = 'ok' and business_id is not null and token_secret is not null;
  if not found then return 0; end if;
  for t in select * from private.wa_templates
            where meta_id is null and (submit_request is null or submitted_at < now() - interval '10 minutes')
            order by name loop
    update private.wa_templates set meta_error = null, submitted_at = now(), submit_request = net.http_post(
        url := format('https://graph.facebook.com/%s/%s/message_templates', a.api_version, a.business_id),
        body := jsonb_build_object('name', t.name, 'language', t.lang, 'category', t.category,
          'components', jsonb_build_array(jsonb_build_object('type', 'BODY', 'text', t.body)
            || case when cardinality(t.example) > 0
                    then jsonb_build_object('example', jsonb_build_object('body_text', jsonb_build_array(to_jsonb(t.example))))
                    else '{}'::jsonb end)),
        headers := jsonb_build_object('Authorization', 'Bearer ' || private.wa_token(), 'Content-Type', 'application/json'),
        timeout_milliseconds := 15000)
     where name = t.name;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function private.wa_templates_submit() from public, anon, authenticated;

-- Reads Meta's answers to submissions, and re-reads the template list while any is under review.
create or replace function private.wa_templates_tick()
returns void language plpgsql security definer set search_path = '' as $$
declare
  t record;
  c jsonb;
begin
  for t in select w.name, h.status_code, h.content, h.error_msg from private.wa_templates w
             join net._http_response h on h.id = w.submit_request loop
    c := case when t.content ~ '^\s*\{' then t.content::jsonb else '{}'::jsonb end;
    if t.status_code between 200 and 299 and c ? 'id' then
      update private.wa_templates set submit_request = null, meta_id = c ->> 'id', meta_status = c ->> 'status',
             meta_category = c ->> 'category', meta_error = null, checked_at = now() where name = t.name;
    else
      update private.wa_templates set submit_request = null, checked_at = now(),
             meta_error = left(coalesce(nullif(concat_ws(' — ', c #>> '{error,error_user_title}', c #>> '{error,error_user_msg}'), ''),
                                        c #>> '{error,message}', t.error_msg, 'HTTP ' || t.status_code), 400)
       where name = t.name;
    end if;
  end loop;
  if exists (select 1 from private.wa_templates where meta_id is not null and coalesce(meta_status, '') not in ('APPROVED', 'REJECTED', 'DISABLED', 'PAUSED')) then
    update private.whatsapp_account set templates_request = net.http_get(
        url := format('https://graph.facebook.com/%s/%s/message_templates', api_version, business_id),
        params := jsonb_build_object('fields', 'name,language,status,category,components,rejected_reason', 'limit', '250'),
        headers := jsonb_build_object('Authorization', 'Bearer ' || private.wa_token()),
        timeout_milliseconds := 15000)
     where id = 1 and status = 'ok' and business_id is not null and token_secret is not null and templates_request is null;
  end if;
end $$;
revoke all on function private.wa_templates_tick() from public, anon, authenticated;

select cron.unschedule('whatsapp-templates') where exists (select 1 from cron.job where jobname = 'whatsapp-templates');
select cron.schedule('whatsapp-templates', '*/10 * * * *', 'select private.wa_templates_tick()');

-- wa_reconcile also writes each catalog template's status from the list it reads.
create or replace function private.wa_reconcile()
returns void language plpgsql security definer set search_path = '' as $$
declare
  a private.whatsapp_account;
  r record;
  c jsonb;
begin
  select * into a from private.whatsapp_account where id = 1;
  if found and a.status = 'checking' and a.check_request is not null then
    select * into r from net._http_response where id = a.check_request;
    if found then
      c := case when r.content ~ '^\s*\{' then r.content::jsonb else '{}'::jsonb end;
      if r.status_code = 200 and c ? 'display_phone_number' then
        update private.whatsapp_account set status = 'ok', display_phone = c ->> 'display_phone_number', verified_name = c ->> 'verified_name',
               quality = c ->> 'quality_rating', error = null, checked_at = now() where id = 1;
      else
        update private.whatsapp_account set status = 'failed', checked_at = now(),
               error = left(coalesce(c #>> '{error,message}', r.error_msg, 'HTTP ' || r.status_code), 300) where id = 1;
      end if;
    elsif a.updated_at < now() - interval '2 minutes' then
      update private.whatsapp_account set status = 'failed', error = 'Meta did not answer', checked_at = now() where id = 1;
    end if;
  end if;
  if a.id is not null and a.templates_request is not null then
    select * into r from net._http_response where id = a.templates_request;
    if found then
      c := case when r.content ~ '^\s*\{' then r.content::jsonb else '{}'::jsonb end;
      if r.status_code = 200 and jsonb_typeof(c -> 'data') = 'array' then
        update private.whatsapp_account set templates_request = null, templates_error = null,
               templates = coalesce((select jsonb_agg(jsonb_build_object(
                   'name', t ->> 'name', 'language', t ->> 'language', 'category', t ->> 'category',
                   'body', (select x ->> 'text' from jsonb_array_elements(t -> 'components') x where x ->> 'type' = 'BODY' limit 1)))
                 from jsonb_array_elements(c -> 'data') t where t ->> 'status' = 'APPROVED'), '[]'::jsonb)
         where id = 1;
        update private.wa_templates w
           set meta_status = t ->> 'status', meta_category = t ->> 'category', meta_id = coalesce(w.meta_id, t ->> 'id'),
               meta_error = case when t ->> 'status' = 'REJECTED' then left(coalesce(nullif(t ->> 'rejected_reason', 'NONE'), 'REJECTED'), 400) end,
               checked_at = now()
          from jsonb_array_elements(c -> 'data') t
         where t ->> 'name' = w.name and t ->> 'language' = w.lang;
      else
        update private.whatsapp_account set templates_request = null,
               templates_error = left(coalesce(c #>> '{error,message}', r.error_msg, 'HTTP ' || r.status_code), 300)
         where id = 1;
      end if;
    elsif a.updated_at < now() - interval '2 minutes' then
      update private.whatsapp_account set templates_request = null, templates_error = 'Meta did not answer' where id = 1;
    end if;
  end if;
  for r in select m.id, h.status_code, h.content, h.error_msg from public.whatsapp_messages m
             join net._http_response h on h.id = m.request_id
            where m.status = 'queued' loop
    c := case when r.content ~ '^\s*\{' then r.content::jsonb else '{}'::jsonb end;
    if r.status_code between 200 and 299 and c #>> '{messages,0,id}' is not null then
      update public.whatsapp_messages set status = 'sent', wa_id = c #>> '{messages,0,id}', sent_at = now() where id = r.id;
    else
      update public.whatsapp_messages set status = 'failed',
             error = left(coalesce(c #>> '{error,message}', r.error_msg, 'HTTP ' || r.status_code), 300) where id = r.id;
    end if;
  end loop;
  update public.whatsapp_messages set status = 'failed', error = 'no answer from Meta'
   where status = 'queued' and created_at < now() - interval '10 minutes';
end $$;

-- ───────────────────────────────────────────── for the app: the catalog and a «send to Meta» button
create or replace function public.staff_wa_templates()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not (private.can_read('whatsapp') or private.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'name', w.name, 'lang', w.lang, 'category', coalesce(w.meta_category, w.category), 'body', w.body, 'moments', w.moments,
      'status', case when private.wa_approved(w.name, w.lang) then 'APPROVED'
                     when w.meta_status is not null then w.meta_status
                     when w.submit_request is not null then 'SENDING'
                     when w.meta_error is not null then 'ERROR' else 'NEW' end,
      'error', w.meta_error, 'submitted_at', w.submitted_at) order by w.name)
    from private.wa_templates w), '[]'::jsonb);
end $$;
revoke all on function public.staff_wa_templates() from public, anon;
grant execute on function public.staff_wa_templates() to authenticated;

create or replace function public.staff_wa_templates_submit()
returns int language plpgsql security definer set search_path = '' as $$
begin
  if not (private.can('whatsapp') or private.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return private.wa_templates_submit();
end $$;
revoke all on function public.staff_wa_templates_submit() from public, anon;
grant execute on function public.staff_wa_templates_submit() to authenticated;

select private.wa_templates_submit();
