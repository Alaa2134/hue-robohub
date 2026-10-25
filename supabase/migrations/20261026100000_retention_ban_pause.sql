-- · Sensitive data is kept only while it's needed: a join application's national ID, governorate and
--   address are wiped when it's turned down, and from any application not accepted within 90 days
--   (accepted ones keep them: the Student Welfare family list needs them).
-- · A no-show ban also pauses the person's app account; lifting the ban restores it (staff_lift_ban
--   already does).

create or replace function private.application_forget_sensitive() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status::text = 'rejected' then
    new.national_id := null;
    new.governorate := null;
    new.address := null;
  end if;
  return new;
end $$;
create or replace trigger applications_forget_sensitive before update of status on public.applications
  for each row execute function private.application_forget_sensitive();

/** Daily: applications that weren't accepted within 90 days don't keep sensitive data. */
create or replace function private.applications_retention() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  update public.applications set national_id = null, governorate = null, address = null
   where status::text <> 'accepted' and created_at < now() - interval '90 days'
     and (national_id is not null or governorate is not null or address is not null);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function private.applications_retention() from public, anon, authenticated;

select cron.schedule('applications-retention', '17 3 * * *', $$select private.applications_retention()$$)
 where not exists (select 1 from cron.job where jobname = 'applications-retention');

-- A ban pauses the app account too (the account found by the phone when the record has none).
select private.patch_function('private.no_show(text,uuid,text,text,text,uuid)',
  $p$    insert into public.community_bans (student_id, phone, name, reason, form_id)$p$,
  $p$    update public.students s set active = false
     where s.active and (s.id = p_student or (p_student is null and private.phone_key(p_phone) is not null
                                              and private.phone_key(s.phone) = private.phone_key(p_phone)));
    insert into public.community_bans (student_id, phone, name, reason, form_id)$p$);
