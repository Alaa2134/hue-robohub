-- Automatic WhatsApp messages: the template of each moment is picked in the app from the approved
-- list, and each message carries as many variables as its template has.
--
-- * The rules pointed at template names that don't exist in the number's WhatsApp account
--   (bx_join_received…), so Meta refused every one (#132001). Rules whose template isn't approved
--   move to the matching approved one when it's there (bx_application_received_v4 …).
-- * The variables were fixed per moment (first name, code…); a template without {{1}} was refused
--   for getting them. Now the first N are sent, N = the highest {{n}} in the template's text.
-- * staff_wa_auto_rules says whether each rule's template is approved; staff_wa_auto_template
--   changes it (WhatsApp senders and admins), only to an approved one.

create or replace function private.wa_vars(p_body text) returns int
language sql immutable set search_path = '' as $$
  select coalesce(max((m[1])::int), 0) from regexp_matches(coalesce(p_body, ''), '\{\{\s*(\d+)\s*\}\}', 'g') m
$$;
revoke execute on function private.wa_vars(text) from public, anon, authenticated;

create or replace function private.wa_auto(p_key text, p_phone text, p_name text, p_params jsonb, p_context text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r private.wa_auto_rules;
  v_phone text := private.wa_phone(p_phone);
  v_body text;
  v_params jsonb;
begin
  if v_phone is null then return; end if;
  select * into r from private.wa_auto_rules where key = p_key and enabled;
  if not found then return; end if;
  if not exists (select 1 from private.whatsapp_account where id = 1 and status = 'ok') then return; end if;
  select t ->> 'body' into v_body from private.whatsapp_account a, jsonb_array_elements(a.templates) t
   where a.id = 1 and t ->> 'name' = r.template and t ->> 'language' = r.lang limit 1;
  if not found then return; end if;
  if exists (select 1 from public.whatsapp_messages where template = r.template and context = p_context and to_phone = v_phone) then
    return;
  end if;
  select coalesce(jsonb_agg(coalesce(p_params -> (i - 1), '"-"'::jsonb) order by i), '[]'::jsonb)
    into v_params from generate_series(1, private.wa_vars(v_body)) i;
  perform private.wa_send(v_phone, p_name, null, r.template, r.lang, v_params, p_context, null);
exception when others then
  return;
end $$;
revoke all on function private.wa_auto(text, text, text, jsonb, text) from public, anon, authenticated;

create or replace function private.wa_approved(p_template text, p_lang text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.whatsapp_account a, jsonb_array_elements(a.templates) t
                  where a.id = 1 and t ->> 'name' = p_template and t ->> 'language' = p_lang)
$$;
revoke execute on function private.wa_approved(text, text) from public, anon, authenticated;

create or replace function public.staff_wa_auto_rules()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not (private.can_read('whatsapp') or private.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(r) || jsonb_build_object('ok', private.wa_approved(r.template, r.lang)) order by r.key)
                     from private.wa_auto_rules r), '[]'::jsonb);
end $$;

create or replace function public.staff_wa_auto_template(p_key text, p_template text, p_lang text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (private.can('whatsapp') or private.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not private.wa_approved(p_template, p_lang) then
    raise exception 'unknown_template' using errcode = 'P0001';
  end if;
  update private.wa_auto_rules set template = p_template, lang = p_lang where key = p_key;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end $$;
revoke all on function public.staff_wa_auto_template(text, text, text) from public, anon;
grant execute on function public.staff_wa_auto_template(text, text, text) to authenticated;

update private.wa_auto_rules r set template = m.t
  from (values ('application_received', 'bx_application_received_v4'),
               ('application_accepted', 'bx_application_accepted_v4'),
               ('application_rejected', 'bx_application_not_selected_v4'),
               ('family_joined', 'bx_application_received_v4')) as m(k, t)
 where r.key = m.k and not private.wa_approved(r.template, r.lang) and private.wa_approved(m.t, r.lang);
