-- WhatsApp from WhatsApp Web (no Meta connection): the app opens each person's chat with the message
-- ready and waits a random few seconds between people; whoever sends records each message here, so the
-- log and the daily limit cover both ways of sending. A safe pace for a personal number: at most 150
-- messages a day from WhatsApp Web (the Cloud API keeps its own 1000).

alter table public.whatsapp_messages add column if not exists via text not null default 'api' check (via in ('api', 'web'));

create or replace function public.staff_whatsapp_web_sent(p_phone text, p_name text, p_body text, p_context text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_phone text := private.wa_phone(p_phone);
  v_today int;
begin
  if not private.can('whatsapp') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_phone is null or char_length(coalesce(p_body, '')) not between 1 and 4096 then
    raise exception 'invalid_message' using errcode = '22023';
  end if;
  select count(*) into v_today from public.whatsapp_messages where via = 'web' and created_at > now() - interval '1 day';
  if v_today >= 150 then
    raise exception 'daily_limit' using errcode = '22023';
  end if;
  insert into public.whatsapp_messages (to_phone, to_name, kind, body, context, status, sent_at, via, created_by)
  values (v_phone, nullif(left(btrim(coalesce(p_name, '')), 120), ''), 'text', p_body, left(p_context, 120), 'sent', now(), 'web', auth.uid());
  return jsonb_build_object('today', v_today + 1, 'left', 150 - v_today - 1);
end $$;
revoke execute on function public.staff_whatsapp_web_sent(text, text, text, text) from public, anon;
grant execute on function public.staff_whatsapp_web_sent(text, text, text, text) to authenticated;
