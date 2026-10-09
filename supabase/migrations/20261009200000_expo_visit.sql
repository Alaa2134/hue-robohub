-- Expo visits (first: Robotex & NDTX Expo 2026, 14–16 November, Egypt International Exhibition Center).
--   Students apply through a website form; the team accepts them in the app. Every answer gets a
--   reference code; with it and their phone, applicants check their status on the site. Once accepted
--   they see the form's "after acceptance" message and link (the expo's visitor registration) and can
--   mark that they registered there; the team sees who did and downloads the list as Excel.
--   Works for any form, not only this one.

alter table public.forms
  add column if not exists accepted_ar text check (char_length(accepted_ar) <= 1000),
  add column if not exists accepted_url text check (accepted_url is null or (accepted_url ~* '^https://[^[:space:]]+$' and char_length(accepted_url) <= 300));

alter table public.form_responses
  add column if not exists ref text,
  add column if not exists external_done_at timestamptz;
update public.form_responses set ref = 'F-' || upper(encode(extensions.gen_random_bytes(4), 'hex')) where ref is null;
alter table public.form_responses
  alter column ref set default 'F-' || upper(encode(extensions.gen_random_bytes(4), 'hex')),
  alter column ref set not null;
create unique index if not exists form_responses_ref_idx on public.form_responses (ref);

-- The applicant gets their code back (also when they had already applied, so a lost code can be found).
select private.patch_function('public.submit_form(text, jsonb, text, text)',
  $p$return jsonb_build_object('ok', true, 'duplicate', true);$p$,
  $p$return jsonb_build_object('ok', true, 'duplicate', true, 'ref',
      (select r.ref from public.form_responses r where r.form_id = f.id and (r.phone = v_phone or r.email = v_email) order by r.created_at limit 1));$p$);
select private.patch_function('public.submit_form(text, jsonb, text, text)',
  $p$case when p_locale = 'en' then 'en' else 'ar' end);
  return jsonb_build_object('ok', true);$p$,
  $p$case when p_locale = 'en' then 'en' else 'ar' end)
  returning ref into v_text;
  return jsonb_build_object('ok', true, 'ref', v_text);$p$);

/** Public: an applicant's status, by reference code and phone. */
create or replace function public.form_status(p_ref text, p_phone text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r public.form_responses;
  f public.forms;
begin
  if not private.throttle('form_status', 30, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  select * into r from public.form_responses
   where ref = upper(btrim(coalesce(p_ref, ''))) and phone = private.clean_phone(p_phone);
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into f from public.forms where id = r.form_id;
  return jsonb_build_object('ok', true, 'status', r.status, 'title_ar', f.title_ar, 'title_en', f.title_en,
    'accepted_ar', case when r.status = 'accepted' then f.accepted_ar end,
    'accepted_url', case when r.status = 'accepted' then f.accepted_url end,
    'external_done', r.external_done_at is not null);
end $$;
revoke execute on function public.form_status(text, text) from public;
grant execute on function public.form_status(text, text) to anon, authenticated;

/** Public: an accepted applicant says they registered on the external site (the expo's). */
create or replace function public.form_external_done(p_ref text, p_phone text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.throttle('form_status', 30, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  update public.form_responses set external_done_at = coalesce(external_done_at, now())
   where ref = upper(btrim(coalesce(p_ref, ''))) and phone = private.clean_phone(p_phone) and status = 'accepted';
  return jsonb_build_object('ok', found);
end $$;
revoke execute on function public.form_external_done(text, text) from public;
grant execute on function public.form_external_done(text, text) to anon, authenticated;

-- The Robotex visit form (open; closes a week before the expo). The team edits it in the app.
insert into public.forms (slug, title_ar, title_en, intro_ar, intro_en, success_ar, success_en, fields, open, closes_at, listed, accepted_ar, accepted_url)
values (
  'robotex-2026',
  'زيارة معرض Robotex & NDTX 2026',
  'Visit to Robotex & NDTX Expo 2026',
  'BuildX HUE رايح زيارة لمعرض Robotex 2026 (الروبوتات والذكاء الاصطناعي والأتمتة الصناعية) مع NDTX 2026، من 14 لـ 16 نوفمبر في مركز مصر للمعارض الدولية بالقاهرة الجديدة. املأ الفورم، والفريق هيراجع ويبعتلك على واتساب.',
  'BuildX HUE is visiting Robotex 2026 (industrial robotics, AI and automation) together with NDTX 2026, 14–16 November at the Egypt International Exhibition Center, New Cairo. Fill in the form and the team will get back to you on WhatsApp.',
  'وصلنا طلبك 🎉 احتفظ بكود الطلب، وتابع حالتك من صفحة الزيارة.',
  'Got it 🎉 Keep your reference code and check your status on the visit page.',
  '[
    {"id":"name","type":"name","label_ar":"الاسم بالكامل (بالعربي)","label_en":"Full name (Arabic)","required":true},
    {"id":"name_en","type":"text","label_ar":"الاسم بالإنجليزي (زي ما هيتكتب على بادج المعرض)","label_en":"Name in English (as on the expo badge)","required":true},
    {"id":"phone","type":"phone","label_ar":"رقم الموبايل (واتساب)","label_en":"Mobile (WhatsApp)","required":true},
    {"id":"email","type":"email","label_ar":"الإيميل","label_en":"Email","required":true,"help_ar":"المعرض بيبعت تأكيد التسجيل والبادج على الإيميل."},
    {"id":"org","type":"text","label_ar":"الجامعة / المدرسة","label_en":"University / school","required":true},
    {"id":"faculty","type":"text","label_ar":"الكلية والقسم","label_en":"Faculty and department","required":false},
    {"id":"year","type":"select","label_ar":"السنة الدراسية","label_en":"Academic year","required":true,"options":[{"ar":"ثانوي","en":"High school"},{"ar":"أولى","en":"1st year"},{"ar":"تانية","en":"2nd year"},{"ar":"تالتة","en":"3rd year"},{"ar":"رابعة","en":"4th year"},{"ar":"خامسة","en":"5th year"},{"ar":"خريج","en":"Graduate"}]},
    {"id":"city","type":"text","label_ar":"المدينة","label_en":"City","required":true},
    {"id":"member","type":"select","label_ar":"إنت طالب في BuildX HUE؟","label_en":"Are you a BuildX HUE student?","required":true,"options":[{"ar":"أيوه","en":"Yes"},{"ar":"لأ","en":"No"}]},
    {"id":"code","type":"text","label_ar":"رقم الكارنيه في BuildX (لو معاك)","label_en":"BuildX student code (if you have one)","required":false},
    {"id":"day","type":"select","label_ar":"اليوم اللي تقدر تيجي فيه","label_en":"Which day can you come?","required":true,"options":[{"ar":"السبت 14 نوفمبر","en":"Saturday 14 November"},{"ar":"الأحد 15 نوفمبر","en":"Sunday 15 November"},{"ar":"الاتنين 16 نوفمبر","en":"Monday 16 November"},{"ar":"أي يوم","en":"Any day"}]},
    {"id":"transport","type":"select","label_ar":"هتيجي إزاي؟","label_en":"How will you get there?","required":true,"options":[{"ar":"مع الفريق (التجمع والمواصلات)","en":"With the team (meeting point and transport)"},{"ar":"هوصل المعرض لوحدي","en":"I''ll get to the expo myself"}]},
    {"id":"interests","type":"multi","label_ar":"أكتر حاجة عايز تشوفها","label_en":"What do you most want to see?","required":false,"options":[{"ar":"الروبوتات الصناعية","en":"Industrial robots"},{"ar":"الذكاء الاصطناعي ورؤية الآلة","en":"AI and machine vision"},{"ar":"الطائرات المسيرة والأنظمة الذاتية","en":"Drones and autonomous systems"},{"ar":"الفحص غير الإتلافي (NDT)","en":"Non-destructive testing (NDT)"},{"ar":"اللحام والتصنيع","en":"Welding and fabrication"},{"ar":"التحول الرقمي والمصانع الذكية","en":"Digital transformation and smart factories"}]},
    {"id":"notes","type":"textarea","label_ar":"أي حاجة عايز تقولها للفريق","label_en":"Anything you want to tell the team","required":false},
    {"id":"agree","type":"checkbox","label_ar":"موافق ألتزم بمواعيد وتعليمات الفريق يوم الزيارة","label_en":"I agree to follow the team''s times and instructions on the day","required":true}
  ]'::jsonb,
  true,
  '2026-11-07T21:59:00Z',
  true,
  'اتقبلت في زيارة المعرض 🎉 الخطوة الجاية: سجّل كزائر في موقع المعرض من الزرار تحت، بنفس الاسم بالإنجليزي والإيميل اللي كتبتهم في الفورم، وبعدها اضغط «سجّلت في موقع المعرض». ميعاد ومكان التجمع هيوصلوك على واتساب.',
  'https://expo.ndtcorner.com/visitor'
)
on conflict (slug) do nothing;
