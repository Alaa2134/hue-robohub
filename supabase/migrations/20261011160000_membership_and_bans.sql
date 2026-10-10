-- Expo visits are for community members, and a no-show costs the membership.
--  1. A form can ask for the BuildX membership number (field type "member"): the site checks it
--     belongs to an active member and keeps who it is (form_responses.student_id). Someone without a
--     membership asks for an interview with the organiser instead (the "membership-interview" form).
--  2. Community bans: someone accepted for a delegation who didn't come is banned and their
--     membership (student account) is switched off, by the team from the day's check-in screen. A
--     ban blocks forms that ask for the membership number and new join applications from that
--     phone, until the team lifts it. Nothing is removed.
--  3. The Robotex form: the membership number is required, everyone travels with the delegation
--     (no "on my own" choice), and applying means agreeing to the no-show rule.

alter table public.form_responses add column if not exists student_id uuid;
create index if not exists form_responses_student_idx on public.form_responses (form_id, student_id) where student_id is not null;

create table if not exists public.community_bans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid,
  phone text,
  name text,
  reason text not null check (char_length(reason) between 1 and 300),
  form_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  lifted_at timestamptz,
  lifted_by uuid
);
create index if not exists community_bans_phone_idx on public.community_bans (phone) where lifted_at is null;
create index if not exists community_bans_student_idx on public.community_bans (student_id) where lifted_at is null;
alter table public.community_bans enable row level security;
create policy community_bans_select on public.community_bans for select to authenticated
  using ((select private.can('forms')) or (select private.can('roster')));
create policy community_bans_insert on public.community_bans for insert to authenticated
  with check ((select private.can('forms')) or (select private.can('roster')));
create policy community_bans_update on public.community_bans for update to authenticated
  using ((select private.can('forms')) or (select private.can('roster')))
  with check ((select private.can('forms')) or (select private.can('roster')));
revoke all on public.community_bans from anon;
grant select, insert, update on public.community_bans to authenticated;

/** Is this phone or member banned from the community right now? */
create or replace function private.is_banned(p_phone text, p_student uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.community_bans b
                  where b.lifted_at is null
                    and ((p_phone is not null and b.phone = p_phone) or (p_student is not null and b.student_id = p_student)))
$$;
revoke execute on function private.is_banned(text, uuid) from public, anon, authenticated;

/** Public: a form's answers, checked against its questions (now with the membership number). */
create or replace function public.submit_form(p_slug text, p_answers jsonb, p_locale text default 'ar', p_website text default '')
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  f public.forms;
  fld jsonb;
  v_id text;
  v_type text;
  v_val jsonb;
  v_text text;
  v_clean jsonb := '{}';
  v_name text;
  v_phone text;
  v_email text;
  v_student uuid;
  v_errors jsonb := '{}';
begin
  if not private.throttle('form', 10, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if coalesce(p_website, '') <> '' or (jsonb_typeof(p_answers) = 'object' and private.form_ms(p_answers ->> '__t') < 1500) then
    perform private.log_security('honeypot', 2, jsonb_build_object('form', p_slug));
    return jsonb_build_object('ok', true);
  end if;
  select * into f from public.forms where slug = lower(btrim(p_slug)) and not archived;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if not private.form_is_open(f) then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if jsonb_typeof(p_answers) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  for fld in select * from jsonb_array_elements(f.fields) loop
    v_id := fld ->> 'id';
    v_type := coalesce(fld ->> 'type', 'text');
    v_val := p_answers -> v_id;
    if v_type = 'multi' then
      if v_val is not null and jsonb_typeof(v_val) <> 'array' then v_val := null; end if;
      if v_val is not null then
        select coalesce(jsonb_agg(x), '[]') into v_val from jsonb_array_elements_text(v_val) x
         where x in (select o ->> 'ar' from jsonb_array_elements(coalesce(fld -> 'options', '[]')) o);
      end if;
      if coalesce((fld ->> 'required')::boolean, false) and coalesce(jsonb_array_length(v_val), 0) = 0 then
        v_errors := v_errors || jsonb_build_object(v_id, 'required');
      elsif v_val is not null and jsonb_array_length(v_val) > 0 then
        v_clean := v_clean || jsonb_build_object(v_id, v_val);
      end if;
      continue;
    end if;
    v_text := case when v_type = 'checkbox' then (case when v_val = 'true'::jsonb then 'نعم' else null end) else nullif(btrim(v_val #>> '{}'), '') end;
    if v_text is null then
      if coalesce((fld ->> 'required')::boolean, false) then v_errors := v_errors || jsonb_build_object(v_id, 'required'); end if;
      continue;
    end if;
    if char_length(v_text) > (case when v_type = 'textarea' then 4000 else 500 end) then
      v_errors := v_errors || jsonb_build_object(v_id, 'too_long');
      continue;
    end if;
    if v_type = 'email' and v_text !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      v_errors := v_errors || jsonb_build_object(v_id, 'email'); continue;
    end if;
    if v_type = 'phone' then
      v_text := private.clean_phone(v_text);
      if v_text is null or v_text !~ '^\+?[0-9]{7,16}$' then v_errors := v_errors || jsonb_build_object(v_id, 'phone'); continue; end if;
    end if;
    if v_type = 'member' then
      select s.id, s.code into v_student, v_text from public.students s where s.active and s.code_key = private.code_key(v_text);
      if v_student is null then v_errors := v_errors || jsonb_build_object(v_id, 'member'); continue; end if;
    end if;
    if v_type = 'number' and v_text !~ '^-?[0-9]+([.][0-9]+)?$' then
      v_errors := v_errors || jsonb_build_object(v_id, 'number'); continue;
    end if;
    if v_type = 'url' and v_text !~* '^https?://[^\s]+$' then
      v_errors := v_errors || jsonb_build_object(v_id, 'url'); continue;
    end if;
    if v_type = 'date' and v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      v_errors := v_errors || jsonb_build_object(v_id, 'date'); continue;
    end if;
    if v_type = 'select' and v_text not in (select o ->> 'ar' from jsonb_array_elements(coalesce(fld -> 'options', '[]')) o) then
      v_errors := v_errors || jsonb_build_object(v_id, 'option'); continue;
    end if;
    v_clean := v_clean || jsonb_build_object(v_id, v_text);
    if v_type = 'name' and v_name is null then v_name := v_text; end if;
    if v_type = 'phone' and v_phone is null then v_phone := v_text; end if;
    if v_type = 'email' and v_email is null then v_email := lower(v_text); end if;
  end loop;

  if v_errors <> '{}' then
    return jsonb_build_object('ok', false, 'error', 'fields', 'fields', v_errors);
  end if;
  if private.is_banned(v_phone, v_student) then
    return jsonb_build_object('ok', false, 'error', 'banned');
  end if;
  -- The same person sending twice gets the first answer back.
  if (v_phone is not null or v_email is not null or v_student is not null) and exists (
    select 1 from public.form_responses where form_id = f.id and (phone = v_phone or email = v_email or student_id = v_student)
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'ref',
      (select r.ref from public.form_responses r where r.form_id = f.id and (r.phone = v_phone or r.email = v_email or r.student_id = v_student) order by r.created_at limit 1));
  end if;
  insert into public.form_responses (form_id, answers, name, phone, email, locale, student_id)
  values (f.id, v_clean, v_name, v_phone, v_email, case when p_locale = 'en' then 'en' else 'ar' end, v_student)
  returning ref into v_text;
  return jsonb_build_object('ok', true, 'ref', v_text);
end $$;
revoke execute on function public.submit_form(text, jsonb, text, text) from public;
grant execute on function public.submit_form(text, jsonb, text, text) to anon, authenticated;

-- A banned phone can't send a new join application either.
select private.patch_function('public.submit_application(jsonb)',
  $p$  insert into public.applications ($p$,
  $p$  if private.is_banned(v_phone, null) then
    return jsonb_build_object('ok', false, 'error', 'banned');
  end if;
  insert into public.applications ($p$);

/**
 * Staff: who was accepted for this delegation and didn't come (no check-in). With p_apply they're
 * banned from the community and their membership is switched off; returns the people either way.
 */
create or replace function public.staff_delegation_no_shows(p_form uuid, p_apply boolean default false) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  f public.forms;
  v_list jsonb;
  r record;
  n int := 0;
begin
  if not private.can('forms') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into f from public.forms where id = p_form;
  if not found or f.delegation is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'phone', x.phone, 'no', x.member_no, 'student_id', x.student_id,
           'banned', private.is_banned(x.phone, x.student_id)) order by x.member_no), '[]'::jsonb)
    into v_list
    from public.form_responses x where x.form_id = p_form and x.status = 'accepted' and x.checked_in_at is null;
  if not p_apply then
    return jsonb_build_object('people', v_list, 'applied', 0);
  end if;
  for r in select x.* from public.form_responses x
            where x.form_id = p_form and x.status = 'accepted' and x.checked_in_at is null
              and not private.is_banned(x.phone, x.student_id) loop
    insert into public.community_bans (student_id, phone, name, reason, form_id)
    values (r.student_id, r.phone, r.name, 'اتقبل في وفد «' || f.title_ar || '» ومحضرش', p_form);
    if r.student_id is not null then
      update public.students set active = false where id = r.student_id;
    end if;
    n := n + 1;
  end loop;
  return jsonb_build_object('people', v_list, 'applied', n);
end $$;
revoke execute on function public.staff_delegation_no_shows(uuid, boolean) from public, anon;
grant execute on function public.staff_delegation_no_shows(uuid, boolean) to authenticated;

/** Staff: lift a ban (and give the membership back if asked). */
create or replace function public.staff_lift_ban(p_id uuid, p_restore boolean default true) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  b public.community_bans;
begin
  if not (private.can('forms') or private.can('roster')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.community_bans set lifted_at = now(), lifted_by = auth.uid() where id = p_id and lifted_at is null returning * into b;
  if b.id is not null and p_restore and b.student_id is not null then
    update public.students set active = true where id = b.student_id;
  end if;
end $$;
revoke execute on function public.staff_lift_ban(uuid, boolean) from public, anon;
grant execute on function public.staff_lift_ban(uuid, boolean) to authenticated;

-- Someone who isn't a member yet asks for an interview with the organiser.
insert into public.forms (slug, title_ar, title_en, intro_ar, intro_en, success_ar, success_en, fields, open, listed)
values ('membership-interview', 'طلب انترفيو للانضمام لكميونيتي BuildX HUE', 'Interview request to join the BuildX HUE community',
  'زيارات المعارض والفعاليات لأعضاء الكميونيتي بس. لو لسه مش عضو، سيب بياناتك ومنظم الموقع هيكلمك يحدد معاك ميعاد انترفيو.',
  'Expo visits and events are for community members. Not a member yet? Leave your details and the organiser will contact you to set up an interview.',
  'وصل طلبك ✓ منظم الموقع هيكلمك على واتساب يحدد معاك ميعاد الانترفيو.',
  'Request received ✓ The organiser will message you on WhatsApp to set up your interview.',
  '[{"id":"name","type":"name","label_ar":"الاسم بالكامل","label_en":"Full name","required":true},
    {"id":"phone","type":"phone","label_ar":"رقم الموبايل (واتساب)","label_en":"Mobile (WhatsApp)","required":true},
    {"id":"email","type":"email","label_ar":"الإيميل","label_en":"Email","required":false},
    {"id":"faculty","type":"text","label_ar":"الكلية والسنة","label_en":"Faculty and year","required":true},
    {"id":"why","type":"textarea","label_ar":"ليه عايز تنضم للكميونيتي؟","label_en":"Why do you want to join?","required":true},
    {"id":"for","type":"text","label_ar":"كنت عايز تقدّم على إيه؟ (مثلاً زيارة معرض Robotex)","label_en":"What did you want to apply for? (e.g. the Robotex visit)","required":false}]'::jsonb,
  true, false)
on conflict (slug) do nothing;

update public.forms set fields = '[
  {"id":"name","type":"name","label_ar":"الاسم بالكامل (بالعربي)","label_en":"Full name (Arabic)","required":true},
  {"id":"name_en","type":"text","label_ar":"الاسم بالإنجليزي (زي ما هيتكتب على بادج المعرض)","label_en":"Name in English (as on the expo badge)","required":true},
  {"id":"phone","type":"phone","label_ar":"رقم الموبايل (واتساب)","label_en":"Mobile (WhatsApp)","required":true},
  {"id":"email","type":"email","label_ar":"الإيميل","label_en":"Email","help_ar":"المعرض بيبعت تأكيد التسجيل والبادج على الإيميل.","required":true},
  {"id":"code","type":"member","label_ar":"رقم عضويتك في كميونيتي BuildX HUE","label_en":"Your BuildX HUE community membership number","help_ar":"الرقم اللي على كارنيه BuildX (اللي بتدخل بيه التطبيق). الزيارة للأعضاء بس.","help_en":"The number on your BuildX card (the one you sign in to the app with). The visit is for members only.","required":true},
  {"id":"org","type":"text","label_ar":"الجامعة","label_en":"University","required":true},
  {"id":"faculty","type":"text","label_ar":"الكلية والقسم","label_en":"Faculty and department","required":false},
  {"id":"year","type":"select","label_ar":"السنة الدراسية","label_en":"Academic year","required":true,"options":[{"ar":"أولى","en":"1st year"},{"ar":"تانية","en":"2nd year"},{"ar":"تالتة","en":"3rd year"},{"ar":"رابعة","en":"4th year"},{"ar":"خامسة","en":"5th year"},{"ar":"خريج","en":"Graduate"}]},
  {"id":"city","type":"text","label_ar":"المدينة","label_en":"City","required":true},
  {"id":"day","type":"select","label_ar":"اليوم اللي تقدر تيجي فيه","label_en":"Which day can you come?","required":true,"options":[{"ar":"السبت 14 نوفمبر","en":"Saturday 14 November"},{"ar":"الأحد 15 نوفمبر","en":"Sunday 15 November"},{"ar":"الاتنين 16 نوفمبر","en":"Monday 16 November"},{"ar":"أي يوم","en":"Any day"}]},
  {"id":"interests","type":"multi","label_ar":"أكتر حاجة عايز تشوفها","label_en":"What do you most want to see?","required":false,"options":[{"ar":"الروبوتات الصناعية","en":"Industrial robots"},{"ar":"الذكاء الاصطناعي ورؤية الآلة","en":"AI and machine vision"},{"ar":"الطائرات المسيرة والأنظمة الذاتية","en":"Drones and autonomous systems"},{"ar":"الفحص غير الإتلافي (NDT)","en":"Non-destructive testing (NDT)"},{"ar":"اللحام والتصنيع","en":"Welding and fabrication"},{"ar":"التحول الرقمي والمصانع الذكية","en":"Digital transformation and smart factories"}]},
  {"id":"notes","type":"textarea","label_ar":"أي حاجة عايز تقولها للفريق","label_en":"Anything you want to tell the team","required":false},
  {"id":"agree","type":"checkbox","label_ar":"موافق أتحرك مع الوفد من مكان التجمع وألتزم بمواعيد وتعليمات الفريق يوم الزيارة","label_en":"I agree to travel with the delegation from the meeting point and follow the team''s times and instructions","required":true},
  {"id":"noshow","type":"checkbox","label_ar":"موافق إني لو اتقبلت ومحضرتش المعرض هاخد حظر من كميونيتي BuildX HUE وتتسحب مني العضوية","label_en":"I agree that if I''m accepted and don''t attend, I''ll be banned from the BuildX HUE community and lose my membership","required":true}
]'::jsonb
 where slug = 'robotex-2026';
