insert into private.email_templates(key,enabled,subject,body) values
('join_open_waitlist',true,'🚀 التقديم في BuildX HUE مفتوح الآن!',E'أهلًا {name}،\n\nزي ما وعدناك لما سجلت في قائمة انتظار فتح التقديم، التقديم للانضمام إلى مجتمع BuildX HUE مفتوح دلوقتي!\n\nقدّم طلبك من الرابط التالي:\nhttps://buildxhue.com/ar/join/\n\nاختار المسار اللي يناسبك وكمّل بياناتك. هنراجع طلبك ونتواصل معاك بالخطوات التالية.\n\nمستنيينك تنضم لينا!\nفريق BuildX HUE – جامعة حورس')
,('join_open_waitlist_en',true,'🚀 BuildX HUE applications are now open!',E'Hello {name},\n\nYou signed up to be notified when applications open. Applications to join BuildX HUE are now open!\n\nApply here:\nhttps://buildxhue.com/join/\n\nChoose your track and complete your application. We will review it and contact you about the next steps.\n\nBuildX HUE – Horus University')
on conflict(key) do nothing;

create or replace function private.application_open_email_tick(p_backfill boolean default false)
returns integer language plpgsql security definer set search_path='' as $fn$
declare w record; t private.email_templates; v_id bigint; v_key text; v_count integer:=0; v_context text; v_name text;
begin
 if not exists(select 1 from public.site_settings where key='applications' and value->>'open'='true') then return 0; end if;
 if not exists(select 1 from private.email_account where id=1 and status='ok') then return 0; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('application_open_email_tick',0));
 -- Only mark a waiting entry notified if the provider accepted its message.
 update public.waitlist w set notified_at=now()
 where w.kind='applications' and w.notified_at is null and exists
 (select 1 from public.email_messages m where m.context='join-open:'||w.id::text and m.template in ('join_open_waitlist','join_open_waitlist_en') and m.status='sent');
 for w in
 select distinct on (lower(btrim(q.email))) q.id,q.name,q.email,q.locale
 from public.waitlist q
 where q.kind='applications' and (p_backfill or q.notified_at is null)
 and q.created_at>now()-interval '180 days'
 and private.email_ok(lower(btrim(coalesce(q.email,''))))
 and not exists(select 1 from public.email_suppressions s where s.email=lower(btrim(q.email)))
 order by lower(btrim(q.email)),q.created_at desc,q.id desc
 loop
   v_context:='join-open:'||w.id::text;
   if exists(select 1 from public.email_messages m where m.context=v_context and m.template in ('join_open_waitlist','join_open_waitlist_en')) then continue; end if;
   if (select count(*) from public.email_messages where created_at>now()-interval '1 day' and status in ('queued','sent')) >= (select daily_limit from private.email_account where id=1) then exit; end if;
   v_key:=case when w.locale='en' then 'join_open_waitlist_en' else 'join_open_waitlist' end;
   select * into t from private.email_templates where key=v_key and enabled;
   if not found then continue; end if;
   v_name:=coalesce(nullif(split_part(btrim(coalesce(w.name,'')),' ',1),''),case when w.locale='en' then 'there' else 'بيك' end);
   begin
     v_id:=private.email_queue(w.email,w.name,t.subject,private.email_fill(t.body,jsonb_build_object('name',v_name)),'auto',v_key,v_context,null,true);
     if v_id is not null then v_count:=v_count+1; end if;
   exception when others then
     raise warning 'application waitlist email enqueue failed: %',sqlstate;
   end;
 end loop;
 return v_count;
end $fn$;
revoke all on function private.application_open_email_tick(boolean) from public,anon,authenticated;

create or replace function private.application_open_email_trigger()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 if new.key='applications' and new.value->>'open'='true' then
   if tg_op='INSERT' or coalesce(old.value->>'open','false')<>'true' then
     perform private.application_open_email_tick(false);
   end if;
 end if;
 return null;
exception when others then
 raise warning 'application opening email trigger failed: %',sqlstate;
 return null;
end $fn$;
revoke all on function private.application_open_email_trigger() from public,anon,authenticated;
drop trigger if exists site_settings_application_open_email on public.site_settings;
create trigger site_settings_application_open_email after insert or update on public.site_settings for each row execute function private.application_open_email_trigger();
select cron.schedule('buildx-application-open-email','*/5 * * * *','select private.application_open_email_tick(false)');
