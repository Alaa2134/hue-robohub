-- «Add to the app» for a student: one tap gives them a fresh password (the 6-digit login code) and
-- sends their sign-in details — email (or student number) and password — to their email, plus a
-- WhatsApp note that the account is ready. Students can now sign in with their email as well as
-- their student number. The password is only ever stored hashed; the copy kept in the email log is
-- masked right after it is handed to the mail provider.

-- ───────────────────────────────────────────── the student's email (optional, one per student)
alter table public.students add column if not exists email text
  check (email is null or (char_length(email) <= 254 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'));
create unique index if not exists students_email_key on public.students (email) where email is not null;

select private.patch_function('private.students_normalize()',
  $f$  new.phone := nullif(btrim(coalesce(new.phone, '')), '');$f$,
  $f$  new.phone := nullif(btrim(coalesce(new.phone, '')), '');
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  if new.email is not null and exists (select 1 from public.students where email = new.email and id <> new.id) then
    raise exception 'email_taken' using errcode = '23505';
  end if;$f$);

-- Fill it from the student's own join application (same phone), only where that gives exactly one
-- email that no other student has.
with cand as (
  select s.id, min(lower(btrim(a.email))) as email
    from public.students s
    join public.applications a on private.wa_phone(a.phone) = private.wa_phone(s.phone)
   where s.email is null and s.phone is not null and a.email is not null and btrim(a.email) <> ''
   group by s.id
  having count(distinct lower(btrim(a.email))) = 1
), uniq as (
  select c.* from cand c
   where (select count(*) from cand c2 where c2.email = c.email) = 1
     and not exists (select 1 from public.students s where s.email = c.email)
     and c.email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
)
update public.students s set email = u.email from uniq u where s.id = u.id;

-- ───────────────────────────────────────────── staff list carries the email
select private.patch_function('public.staff_list_students()',
  $f$'phone', s.phone,$f$,
  $f$'phone', s.phone, 'email', s.email,$f$);

-- ───────────────────────────────────────────── sign in with email or student number
select private.patch_function('public.student_login(text, text)',
  $f$if v_key is null or p_pin is null$f$,
  $f$if (v_key is null and position('@' in coalesce(p_code, '')) = 0) or p_pin is null$f$);
select private.patch_function('public.student_login(text, text)',
  $f$select * into v_st from public.students where code_key = v_key and active;$f$,
  $f$select * into v_st from public.students
   where active and case when position('@' in coalesce(p_code, '')) > 0 then email = lower(btrim(p_code)) else code_key = v_key end;$f$);

-- ───────────────────────────────────────────── WhatsApp note (no password: Meta refuses codes in utility templates)
insert into private.wa_templates (name, category, moments, example, body) values
('bx_app_ready_v1', 'UTILITY', '{}', '{أحمد,ahmed@example.com}',
'أهلًا {{1}}، حسابك على تطبيق BuildX HUE اتعمل ✅
اسم الدخول: {{2}}
كلمة السر وصلتك على الإيميل (أو اطلبها من المدرّب)، وتقدر تغيّرها من جوه التطبيق.
ادخل من buildxhue.com/app')
on conflict (name) do nothing;

-- ───────────────────────────────────────────── the button
create or replace function public.staff_student_app_invite(p_id uuid, p_email text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_st public.students%rowtype;
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_pins jsonb;
  v_pin text;
  v_first text;
  v_login text;
  v_url text;
  v_body text;
  v_mid bigint;
  v_mail text := 'no_email';
  v_wa text := 'no_phone';
  v_phone text;
begin
  if not private.can('roster') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_st from public.students where id = p_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not v_st.active then
    raise exception 'inactive' using errcode = '22023';
  end if;
  if v_email is not null and v_email is distinct from v_st.email then
    if not private.email_ok(v_email) then
      raise exception 'invalid_email' using errcode = '22023';
    end if;
    update public.students set email = v_email where id = p_id returning * into v_st;
  end if;

  -- A fresh password (old one stops, signed-in devices sign out), same as «رمز دخول جديد».
  v_pins := public.staff_set_pins(array[p_id], false);
  v_pin := v_pins -> 0 ->> 'pin';
  v_first := coalesce(nullif(split_part(v_st.full_name, ' ', 1), ''), v_st.full_name);
  v_login := coalesce(v_st.email, v_st.code);
  v_url := 'https://buildxhue.com/app/#/login?c=' || replace(v_st.code, ' ', '%20');

  if v_st.email is not null then
    if not exists (select 1 from private.email_account where id = 1 and status = 'ok') then
      v_mail := 'not_connected';
    else
      v_body := format(E'أهلًا %s،\n\nاتعملك حساب على تطبيق BuildX HUE 🎉\n\nبيانات الدخول:\nالإيميل: %s\nكلمة السر: %s\n(وتقدر تدخل برقم الطالب %s بدل الإيميل)\n\nادخل من هنا: %s\n\nبعد ما تدخل غيّر كلمة السر من «حسابي ← تغيير رمز الدخول». ماتبعتش كلمة السر لحد.\n\nفريق BuildX HUE',
                       v_first, v_st.email, v_pin, v_st.code, v_url);
      begin
        v_mid := private.email_queue(v_st.email, v_st.full_name, 'بيانات دخولك على تطبيق BuildX HUE', v_body,
                                     'manual', 'app_invite', 'app_invite:' || v_st.id, auth.uid(), false);
        if v_mid is null then
          v_mail := 'unsubscribed';
        else
          -- The provider already has the message; the log keeps no readable password.
          update public.email_messages set body = replace(body, 'كلمة السر: ' || v_pin, 'كلمة السر: ••••••') where id = v_mid;
          v_mail := 'sent';
        end if;
      exception when others then
        v_mail := case when sqlerrm = 'daily_limit' then 'daily_limit' else 'failed' end;
      end;
    end if;
  end if;

  v_phone := private.wa_phone(v_st.phone);
  if v_phone is not null then
    begin
      if not exists (select 1 from private.whatsapp_account where id = 1 and status = 'ok') then
        v_wa := 'not_connected';
      elsif private.wa_send_best(v_phone, v_st.full_name, array['bx_app_ready_v1'], 'ar',
                                 jsonb_build_array(v_first, v_login), 'app_invite:' || v_st.id, null) is not null then
        v_wa := 'sent';
      else
        v_wa := 'template_pending';
      end if;
    exception when others then
      v_wa := 'failed';
    end;
  end if;

  insert into public.audit_log (actor, actor_email, action, entity, entity_id, detail)
  values (auth.uid(), auth.jwt() ->> 'email', 'app_invite', 'students', v_st.id::text,
          jsonb_build_object('email', v_mail, 'whatsapp', v_wa, 'st', v_st.full_name));

  return jsonb_build_object('id', v_st.id, 'code', v_st.code, 'name', v_st.full_name, 'group', v_st.group_name,
    'email', v_st.email, 'pin', v_pin, 'sent', jsonb_build_object('email', v_mail, 'whatsapp', v_wa));
end $$;
revoke all on function public.staff_student_app_invite(uuid, text) from public, anon;
grant execute on function public.staff_student_app_invite(uuid, text) to authenticated;

select private.wa_templates_submit();
