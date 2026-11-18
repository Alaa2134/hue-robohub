-- Review and apply after verified Resend delivery. Preserve the old credentials and logs.
begin;
do $$ begin
 if not exists(select 1 from private.email_account a where a.id=1 and a.status='ok' and (a.domains is null or exists(select 1 from jsonb_array_elements(a.domains) d where lower(d->>'name')=lower(split_part(a.from_email,'@',2)) and d->>'status'='verified'))) or not exists(select 1 from public.email_messages where kind='test' and status='sent' and created_at>now()-interval '7 days') then raise exception 'Verify Resend and send a successful test email before cutover'; end if;
end $$;
create or replace function private.email_html(p_text text, p_unsub text) returns text
language plpgsql immutable set search_path = ''
as $$
declare
  v text := replace(replace(replace(replace(coalesce(p_text, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
begin
  v := regexp_replace(v, '(https?://[^[:space:]<]+)', '<a href="\1" style="color:#2b6dff;word-break:break-all">\1</a>', 'g');
  v := replace(v, E'\n', '<br>');
  return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    || '<body style="margin:0;padding:0;background:#eef2f9">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f9;padding:24px 12px"><tr><td align="center">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Tahoma,Arial,sans-serif">'
    || '<tr><td style="background:#081634;padding:20px 28px;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:.5px" dir="ltr" align="left"><img src="https://buildxhue.com/brand/logo-badge-160.png" width="52" height="52" alt="BuildX HUE" style="vertical-align:middle;margin-right:12px;border:0">BuildX <span style="color:#38dcff">HUE</span><br><span style="font-size:12px;color:#b6c9e5">Horus University · Robotics, Embedded Systems &amp; AI</span><img src="https://buildxhue.com/brand/hue-logo.png" width="48" height="48" alt="Horus University" style="float:right;background:#fff;border-radius:6px;object-fit:contain"></td></tr>'
    || '<tr><td dir="rtl" style="padding:28px;border-top:4px solid #38dcff;color:#14213d;font-size:15px;line-height:1.9;text-align:right">' || v || '</td></tr>'
    || '<tr><td align="center" style="padding:0 24px 24px"><a href="https://buildxhue.com/app/" style="display:inline-block;background:#143d80;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold">BuildX HUE App</a></td></tr>'
    || '<tr><td dir="rtl" style="padding:16px 28px;background:#f6f8fc;color:#6b7690;font-size:12px;line-height:1.7;text-align:right">'
    || 'BuildX HUE · مجتمع الروبوتكس والابتكار بجامعة حورس · <a href="https://buildxhue.com" style="color:#6b7690">buildxhue.com</a>'
    || case when p_unsub is null then '' else '<br><a href="' || replace(p_unsub, '&', '&amp;') || '" style="color:#6b7690">إلغاء الاشتراك في رسايلنا</a>' end
    || '</td></tr></table></td></tr></table></body></html>';
end $$;
revoke execute on function private.email_html(text, text) from public, anon;
grant execute on function private.email_html(text, text) to authenticated;


insert into private.email_templates(key,enabled,subject,body) values
('form_received',true,'تم استلام طلبك – {event}','أهلًا {name}،

تم استلام طلبك، وسيتم مراجعته.
رقم الطلب: {ref}
متابعة الطلب: {status_url}

فريق BuildX HUE'),
('form_accepted',true,'مبروك! تم قبولك – {event}','أهلًا {name}،

تم قبول طلبك في «{event}».
موعد الفعالية: {date}
رقم الطلب: {ref}
متابعة الطلب: {status_url}
تصريح الحضور: {pass_url}

فريق BuildX HUE'),
('form_rejected',true,'تحديث طلبك – {event}','أهلًا {name}،

للأسف لم يتم قبول طلبك هذه المرة، ونتمنى لك التوفيق في الفرص القادمة.
متابعة الطلب: {status_url}

فريق BuildX HUE'),
('form_waitlist',true,'قائمة الانتظار – {event}','أهلًا {name}،

طلبك في قائمة الانتظار. سنتواصل معك عند توفر مكان.
متابعة الطلب: {status_url}

فريق BuildX HUE'),
('event_reminder',true,'تذكير بموعد {event}','أهلًا {name}،

موعد الفعالية: {date}
تذكرتك: {ticket_url}

فريق BuildX HUE'),
('form_session_reminder',true,'تذكير بالحضور – {event}','أهلًا {name}،

الموعد: {date}
تصريح الحضور: {pass_url}

فريق BuildX HUE'),
('form_unpaid',true,'تذكير برسوم {event}','أهلًا {name}،

برجاء سداد رسوم «{event}» البالغة {amount} جنيه.
طريقة الدفع: {how}
رقم الطلب: {ref}
متابعة الطلب: {status_url}
لو دفعت بالفعل تجاهل هذه الرسالة.

فريق BuildX HUE'),
('application_interview_reminder',true,'تذكير بالمقابلة – BuildX HUE','أهلًا {name}،

موعد مقابلتك: {date}
متابعة الطلب: {status_url}

فريق BuildX HUE'),
('application_next_steps',true,'خطوتك القادمة مع BuildX HUE','أهلًا {name}،

نتمنى لك بداية موفقة معنا. تابع طلبك لمعرفة الخطوات القادمة:
{status_url}

فريق BuildX HUE')
 ,('membership_expiring',true,'تجديد عضوية BuildX HUE',E'أهلًا {name}،\n\nعضويتك هتنتهي يوم {date}. تواصل مع الفريق للتجديد.\n\nفريق BuildX HUE')
on conflict(key) do nothing;
create index if not exists email_messages_auto_context_idx on public.email_messages(template,to_email,context);
create or replace function private.email_once(p_key text,p_to text,p_name text,p_vars jsonb,p_context text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.email_ok(lower(btrim(coalesce(p_to,'')))) then return; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key||':'||lower(btrim(p_to))||':'||left(p_context,120),0));
 if exists(select 1 from public.email_messages where template=p_key and to_email=lower(btrim(p_to)) and context=left(p_context,120)) then return; end if;
 perform private.email_auto(p_key,p_to,p_name,p_vars,p_context);
end $$;
revoke all on function private.email_once(text,text,text,jsonb,text) from public,anon,authenticated;
create or replace function private.form_email_vars(p_slug text,p_ref text,p_pass text,p_event text,p_at timestamptz)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('event',p_event,'ref',p_ref,'date',to_char(p_at at time zone 'Africa/Cairo','YYYY-MM-DD HH24:MI'),'status_url',case when p_slug='robotex-2026' then 'https://buildxhue.com/ar/robotex/?ref='||p_ref else 'https://buildxhue.com/ar/form/?f='||p_slug||'&ref='||p_ref end,'pass_url',case when p_pass is not null then 'https://buildxhue.com/ar/form/?pass='||lower(p_pass) end)
$$;
revoke all on function private.form_email_vars(text,text,text,text,timestamptz) from public,anon,authenticated;
create or replace function private.form_responses_email_first()
returns trigger language plpgsql security definer set search_path='' as $$
declare f public.forms; k text; v_at timestamptz;
begin
 if tg_op='INSERT' then k:='form_received';
 elsif new.status is distinct from old.status and new.status::text in ('accepted','rejected','waiting') then k:=case when new.status::text='waiting' then 'form_waitlist' else 'form_'||new.status::text end;
 else return null; end if;
 select * into f from public.forms where id=new.form_id;
 if not found then return null; end if;
 v_at:=coalesce(private.form_next_session(f.attendance,new.answers),f.event_at);
 perform private.email_once(k,new.email,new.name,private.form_email_vars(f.slug,new.ref,case when new.status::text='accepted' then new.pass else null end,f.title_ar,v_at),'form:'||new.id);
 return null;
exception when others then return null;
end $$;
revoke all on function private.form_responses_email_first() from public,anon,authenticated;
create trigger form_responses_email_first after insert or update of status on public.form_responses for each row execute function private.form_responses_email_first();
create or replace function private.email_first_tick()
returns void language plpgsql security definer set search_path='' as $$
declare x record; v_round int;
begin
 if extract(hour from now() at time zone 'Africa/Cairo') not between 10 and 20 then return; end if;
 if not exists(select 1 from private.email_account where id=1 and status='ok') then return; end if;
 if not pg_catalog.pg_try_advisory_xact_lock(11620261118::bigint) then return; end if;
 for x in select r.id,r.full_name,r.email,r.ticket,e.title,e.title_ar,e.starts_at from public.event_registrations r join public.site_content e on e.id=r.event_id where r.status='going' and r.email is not null and e.starts_at between now()+interval '2 hours' and now()+interval '26 hours' loop
 perform private.email_once('event_reminder',x.email,x.full_name,jsonb_build_object('event',coalesce(nullif(x.title_ar,''),x.title),'date',to_char(x.starts_at at time zone 'Africa/Cairo','YYYY-MM-DD HH24:MI'),'ticket_url','https://buildxhue.com/ar/ticket/?t='||x.ticket),'event:'||x.id||':'||extract(epoch from x.starts_at)::text);
 end loop;
 for x in select r.id,r.name,r.email,r.ref,r.pass,f.slug,f.title_ar,(s->>'at')::timestamptz as at,s->>'id' as sid from public.forms f cross join lateral jsonb_array_elements(private.form_sessions(f.attendance)) s join public.form_responses r on r.form_id=f.id where coalesce(f.attendance->>'on','false')='true' and not f.archived and r.status='accepted' and r.email is not null and coalesce(s->>'at','') ~ '^\d{4}-\d{2}-\d{2}' and (s->>'at')::timestamptz between now()+interval '2 hours' and now()+interval '26 hours' and private.form_session_for(f.attendance,s,r.answers) loop
 perform private.email_once('form_session_reminder',x.email,x.name,private.form_email_vars(x.slug,x.ref,x.pass,x.title_ar,x.at),'form:'||x.id||':'||left(x.sid,30)||':'||extract(epoch from x.at)::text);
 end loop;
 for x in select r.id,r.name,r.email,r.ref,r.created_at,f.slug,f.title_ar,f.payment,f.event_at from public.form_responses r join public.forms f on f.id=r.form_id where coalesce((f.payment->>'on')::boolean,false) and coalesce((f.payment->>'amount')::numeric,0)>0 and not f.archived and (f.event_at is null or f.event_at>now()) and r.status='accepted' and r.paid_at is null and r.email is not null and r.created_at between now()-interval '8 days' and now()-interval '2 days' loop
 v_round:=floor(extract(epoch from now()-x.created_at)/172800)::int;
 if v_round between 1 and 3 then perform private.email_once('form_unpaid',x.email,x.name,private.form_email_vars(x.slug,x.ref,null,x.title_ar,x.event_at)||jsonb_build_object('amount',trim_scale((x.payment->>'amount')::numeric)::text,'how',nullif(btrim(x.payment->>'note_ar'),'')),'form:'||x.id||':unpaid:'||v_round); end if;
 end loop;
 for x in select ref,full_name,email,interview_at from public.applications where email is not null and status::text not in ('accepted','rejected') and interview_at between now()+interval '2 hours' and now()+interval '26 hours' loop
 perform private.email_once('application_interview_reminder',x.email,x.full_name,jsonb_build_object('date',to_char(x.interview_at at time zone 'Africa/Cairo','YYYY-MM-DD HH24:MI'),'status_url','https://buildxhue.com/ar/join/status/?ref='||x.ref),'application:'||x.ref||':interview:'||extract(epoch from x.interview_at)::text);
 end loop;
 for x in select ref,full_name,email from public.applications where email is not null and status::text='accepted' and reviewed_at between now()-interval '3 days' and now()-interval '20 hours' loop
 perform private.email_once('application_next_steps',x.email,x.full_name,jsonb_build_object('status_url','https://buildxhue.com/ar/join/status/?ref='||x.ref),'application:'||x.ref||':next');
 end loop;
 for x in select id,email,full_name,member_until from public.students where active and email is not null and member_until between private.cairo_today() and private.cairo_today()+7 loop
 perform private.email_once('membership_expiring',x.email,x.full_name,jsonb_build_object('date',x.member_until),'member:'||x.id||':'||x.member_until);
 end loop;
end $$;
revoke all on function private.email_first_tick() from public,anon,authenticated;
-- Stop paid sends, preserving credentials and logs. Do not auto-reconnect.
update private.wa_auto_rules set enabled=false where enabled;
update private.whatsapp_account set status='off',updated_at=now() where id=1;
select cron.schedule('buildx-email-first','17 * * * *','select private.email_first_tick()');
commit;
