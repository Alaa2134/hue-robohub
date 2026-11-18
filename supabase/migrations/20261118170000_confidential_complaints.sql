-- Separate sensitive reports from ordinary forms and the shared inbox.
create table public.confidential_complaints (
 id uuid primary key default gen_random_uuid(),
 token_hash text unique not null,
 locale text not null check(locale in ('ar','en')),
 anonymous boolean not null,
 kind text not null check(kind in ('complaint','problem','misconduct','suggestion','other')),
 department text not null check(department in ('general','leadership','hr','ai','embedded','technical','media','organization','finance')),
 priority text not null check(priority in ('normal','important','urgent')),
 subject text not null check(char_length(subject) between 3 and 150),
 details text not null check(char_length(details) between 15 and 5000),
 solution text check(char_length(solution)<=2000),
 name text check(char_length(name)<=150),
 contact text check(char_length(contact)<=200),
 status text not null default 'received' check(status in ('received','review','progress','resolved','closed')),
 reply text check(char_length(reply)<=2000),
 internal_note text check(char_length(internal_note)<=4000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 handled_by uuid,
 check((anonymous and name is null and contact is null) or (not anonymous and name is not null))
);
alter table public.confidential_complaints enable row level security;
revoke all on public.confidential_complaints from public, anon, authenticated;
create index confidential_complaints_created_idx on public.confidential_complaints(created_at desc);

create function private.complaint_owner() returns boolean
language sql stable security definer set search_path='' as $$
 select private.mfa_ok() and exists(select 1 from public.staff s where s.user_id=auth.uid() and s.active and s.role='owner');
$$;
revoke all on function private.complaint_owner() from public, anon, authenticated;

create function public.submit_confidential_complaint(p jsonb) returns jsonb
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
 perform private.inbox_add(array(select user_id from public.staff where active and role='owner'),'بلاغ سري جديد','يوجد بلاغ يحتاج إلى مراجعة.','/staff/complaints');
 return jsonb_build_object('ok',true,'code',v_code);
exception when check_violation or not_null_violation then return jsonb_build_object('ok',false,'error','invalid');
end $$;

create function public.confidential_complaint_status(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v jsonb;
begin
 if not private.throttle('confidential_complaint_status',30,interval '1 hour') then return jsonb_build_object('ok',false); end if;
 if p_code is null or p_code !~ '^BX-CMP-[0-9a-f]{32}$' then return jsonb_build_object('ok',false); end if;
 select jsonb_build_object('ok',true,'status',c.status,'reply',c.reply) into v
 from public.confidential_complaints c where c.token_hash=encode(extensions.digest(p_code,'sha256'),'hex');
 return coalesce(v,jsonb_build_object('ok',false));
end $$;

create function public.staff_confidential_complaints() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.complaint_owner() then raise exception 'not allowed' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(c)-'token_hash' order by c.created_at desc) from (select * from public.confidential_complaints order by created_at desc limit 500) c),'[]'::jsonb);
end $$;

create function public.staff_update_confidential_complaint(p_id uuid,p_status text,p_reply text,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not private.complaint_owner() then raise exception 'not allowed' using errcode='42501'; end if;
 update public.confidential_complaints set status=p_status,reply=nullif(btrim(p_reply),''),internal_note=nullif(btrim(p_note),''),updated_at=now(),handled_by=auth.uid() where id=p_id;
 return jsonb_build_object('ok',found);
end $$;
revoke all on function public.submit_confidential_complaint(jsonb),public.confidential_complaint_status(text),public.staff_confidential_complaints(),public.staff_update_confidential_complaint(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.submit_confidential_complaint(jsonb),public.confidential_complaint_status(text) to anon,authenticated;
grant execute on function public.staff_confidential_complaints(),public.staff_update_confidential_complaint(uuid,text,text,text) to authenticated;
