-- Re-reading the template list while some are under review gives Meta its two minutes to answer:
-- wa_reconcile measures the wait from whatsapp_account.updated_at, which the request now sets.
-- Before, a reconcile that ran before Meta's answer cleared the request as «Meta did not answer»
-- and the app warned that templates could not be read.

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
    update private.whatsapp_account set updated_at = now(), templates_request = net.http_get(
        url := format('https://graph.facebook.com/%s/%s/message_templates', api_version, business_id),
        params := jsonb_build_object('fields', 'name,language,status,category,components,rejected_reason', 'limit', '250'),
        headers := jsonb_build_object('Authorization', 'Bearer ' || private.wa_token()),
        timeout_milliseconds := 15000)
     where id = 1 and status = 'ok' and business_id is not null and token_secret is not null and templates_request is null;
  end if;
end $$;
revoke all on function private.wa_templates_tick() from public, anon, authenticated;

-- Read the list again now, so the false warning goes away.
select private.wa_templates_tick();
