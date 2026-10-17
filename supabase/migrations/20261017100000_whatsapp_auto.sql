-- Automatic WhatsApp messages (approved templates only), the same moments as the automatic emails:
-- application received / accepted / not accepted, family registration received.
-- private.wa_auto never raises, never double-sends the same template for the same context, and does
-- nothing unless WhatsApp is connected and the rule is on.

create table if not exists private.wa_auto_rules (
  key text primary key,
  label_ar text not null,
  template text not null,
  lang text not null default 'ar',
  enabled boolean not null default true
);
revoke all on private.wa_auto_rules from public, anon, authenticated;

insert into private.wa_auto_rules (key, label_ar, template) values
  ('application_received', 'استلام طلب الانضمام', 'bx_join_received'),
  ('application_accepted', 'قبول طلب الانضمام', 'bx_join_accepted'),
  ('application_rejected', 'اعتذار عن طلب الانضمام', 'bx_join_not_accepted'),
  ('family_joined', 'استلام تسجيل الأسرة', 'bx_family_received')
on conflict (key) do nothing;

create or replace function private.wa_auto(p_key text, p_phone text, p_name text, p_params jsonb, p_context text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r private.wa_auto_rules;
  v_phone text := private.wa_phone(p_phone);
begin
  if v_phone is null then return; end if;
  select * into r from private.wa_auto_rules where key = p_key and enabled;
  if not found then return; end if;
  if not exists (select 1 from private.whatsapp_account where id = 1 and status = 'ok') then return; end if;
  if not exists (select 1 from private.whatsapp_account a, jsonb_array_elements(a.templates) t
                  where a.id = 1 and t ->> 'name' = r.template and t ->> 'language' = r.lang) then return; end if;
  if exists (select 1 from public.whatsapp_messages where template = r.template and context = p_context and to_phone = v_phone) then
    return;
  end if;
  perform private.wa_send(v_phone, p_name, null, r.template, r.lang, p_params, p_context, null);
exception when others then
  return;
end $$;
revoke all on function private.wa_auto(text, text, text, jsonb, text) from public, anon, authenticated;

create or replace function private.applications_wa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_first text := coalesce(nullif(split_part(btrim(coalesce(new.full_name, '')), ' ', 1), ''), '-');
  v_track text;
  v_no text;
begin
  if tg_op = 'INSERT' then
    perform private.wa_auto('application_received', new.phone, new.full_name, jsonb_build_array(v_first, new.ref), 'application:' || new.ref);
  elsif new.status is distinct from old.status and new.status::text = 'accepted' then
    v_track := case new.track_first
      when 'robotics-embedded' then 'الروبوتات والأنظمة المدمجة'
      when 'ai-ml' then 'الذكاء الاصطناعي'
      when 'iot' then 'إنترنت الأشياء'
      when 'media-design' then 'الميديا والتصميم'
      when 'business' then 'الأعمال'
      else coalesce(nullif(new.track_first, ''), 'BuildX') end;
    select s.code into v_no from public.students s where s.id = new.student_id;
    perform private.wa_auto('application_accepted', new.phone, new.full_name,
      jsonb_build_array(v_first, v_track, coalesce(v_no, new.ref)), 'application:' || new.ref);
  elsif new.status is distinct from old.status and new.status::text = 'rejected' then
    perform private.wa_auto('application_rejected', new.phone, new.full_name, jsonb_build_array(v_first, new.ref), 'application:' || new.ref);
  end if;
  return null;
end $$;

create or replace function private.family_wa()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.wa_auto('family_joined', new.phone, new.full_name,
    jsonb_build_array(coalesce(nullif(split_part(btrim(coalesce(new.full_name, '')), ' ', 1), ''), '-'), coalesce(new.academic_year, '-')),
    'family:' || new.ref);
  return null;
end $$;

drop trigger if exists applications_wa on public.applications;
create trigger applications_wa after insert or update of status on public.applications
  for each row execute function private.applications_wa();
drop trigger if exists family_members_wa on public.family_members;
create trigger family_members_wa after insert on public.family_members
  for each row execute function private.family_wa();

-- On/off per rule, for staff who may manage WhatsApp.
create or replace function public.staff_wa_auto_rules()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not (private.can_read('whatsapp') or private.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.key) from private.wa_auto_rules r), '[]'::jsonb);
end $$;

create or replace function public.staff_wa_auto_set(p_key text, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (private.can('whatsapp') or private.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update private.wa_auto_rules set enabled = p_enabled where key = p_key;
end $$;

revoke all on function public.staff_wa_auto_rules(), public.staff_wa_auto_set(text, boolean) from public, anon;
grant execute on function public.staff_wa_auto_rules(), public.staff_wa_auto_set(text, boolean) to authenticated;
