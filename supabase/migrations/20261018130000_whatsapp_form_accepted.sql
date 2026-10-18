-- Accepting a form response sends WhatsApp: «تأكيد التسجيل في فعالية» (bx_event_registration_confirmed_v4)
-- with the form's title and day. The day comes from the form's QR-attendance session or, for forms
-- without one, from forms.event_at. A template whose value is unknown («-») is never sent.

alter table public.forms add column if not exists event_at timestamptz;
comment on column public.forms.event_at is 'When the form''s event happens (used in WhatsApp messages when the form has no QR-attendance session)';

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
  if exists (select 1 from jsonb_array_elements_text(v_params) x where btrim(coalesce(x, '')) in ('', '-')) then
    return;
  end if;
  perform private.wa_send(v_phone, p_name, null, r.template, r.lang, v_params, v_ctx, null);
exception when others then
  return;
end $$;

create or replace function private.form_responses_wa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  f public.forms;
  v_next timestamptz;
  v_params jsonb;
begin
  select * into f from public.forms where id = new.form_id;
  if not found or f.delegation is not null then return null; end if;
  v_next := coalesce(private.form_next_session(f.attendance, new.answers), case when f.event_at > now() then f.event_at end);
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

update private.wa_auto_rules
   set template = 'bx_event_registration_confirmed_v4', lang = 'ar',
       vars_ar = '{{1}} اسم الفورم · {{2}} يوم الفعالية (من «الحضور بالـ QR» أو ميعاد الفورم) — لو مفيش يوم مش بتتبعت',
       enabled = true, enabled_at = coalesce(enabled_at, now())
 where key = 'form_accepted';
