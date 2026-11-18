-- Dedicated reviewer (not all owners). Bind the selected staff UUID separately in the private production database.
create table private.complaint_reviewer (
 singleton boolean primary key default true check(singleton),
 user_id uuid not null unique references auth.users(id) on delete cascade
);
alter table private.complaint_reviewer enable row level security;
revoke all on private.complaint_reviewer from public, anon, authenticated;
create or replace function private.complaint_owner() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(auth.jwt()->>'aal','')='aal2'
 and exists(select 1 from private.complaint_reviewer r join public.staff s on s.user_id=r.user_id
 where r.user_id=auth.uid() and s.active and s.role='owner');
$$;
revoke all on function private.complaint_owner() from public, anon, authenticated;
create function public.staff_can_review_complaints() returns boolean
language sql stable security definer set search_path='' as $$
 select private.complaint_owner();
$$;
revoke all on function public.staff_can_review_complaints() from public, anon, authenticated;
grant execute on function public.staff_can_review_complaints() to authenticated;
create or replace function public.submit_confidential_complaint(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_code text := 'BX-CMP-' || encode(extensions.gen_random_bytes(16),'hex');
 v_anonymous boolean;
 v_name text;
 v_contact text;
begin
 if not private.throttle('confidential_complaint_submit',5,interval '1 hour') then
  return jsonb_build_object('ok',false,'error','rate_limited');
 end if;
 if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>30000 or p->'consent' is distinct from 'true'::jsonb
    or jsonb_typeof(p->'anonymous') is distinct from 'boolean' then return jsonb_build_object('ok',false,'error','invalid'); end if;
 v_anonymous := (p->>'anonymous')::boolean;
 if not v_anonymous then
  v_name:=nullif(btrim(coalesce(p->>'name','')),'');
  v_contact:=nullif(btrim(coalesce(p->>'contact','')),'');
  if v_name is null then return jsonb_build_object('ok',false,'error','invalid'); end if;
 end if;
 insert into public.confidential_complaints(token_hash,locale,anonymous,kind,department,priority,subject,details,solution,name,contact)
 values(encode(extensions.digest(v_code,'sha256'),'hex'),p->>'locale',v_anonymous,p->>'kind',p->>'department',p->>'priority',btrim(p->>'subject'),btrim(p->>'details'),nullif(btrim(p->>'solution'),''),v_name,v_contact);
 perform private.inbox_add(array(select r.user_id from private.complaint_reviewer r join public.staff s on s.user_id=r.user_id where s.active and s.role='owner'),'بلاغ سري جديد','يوجد بلاغ يحتاج إلى مراجعة.','/staff/complaints');
 return jsonb_build_object('ok',true,'code',v_code);
exception when check_violation or not_null_violation then return jsonb_build_object('ok',false,'error','invalid');
end $$;


revoke all on function public.submit_confidential_complaint(jsonb) from public, anon, authenticated;
grant execute on function public.submit_confidential_complaint(jsonb) to anon, authenticated;
