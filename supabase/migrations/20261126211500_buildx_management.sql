-- Live BuildX App (static GitHub Pages + existing PIN/staff authentication).
-- No existing records or legacy permissions are modified.
create table private.bms_units (
 id uuid primary key default gen_random_uuid(), name text not null check (length(trim(name)) between 1 and 120),
 kind text not null check (kind in ('technical','nontechnical','competition','sector','group','project','responsibility')),
 parent_id uuid references private.bms_units(id), applications_open boolean not null default false,
 archived boolean not null default false, budget numeric(12,2) not null default 0 check(budget>=0),
 deadline date, created_at timestamptz not null default now()
);
create table private.bms_grants (
 id uuid primary key default gen_random_uuid(), unit_id uuid not null references private.bms_units(id),
 student_id uuid references public.students(id) on delete cascade, staff_id uuid references public.staff(user_id) on delete cascade,
 role text not null check(role in ('member','head','co_head','leader','supervisor','captain','coordinator','reviewer','watcher','instructor')),
 reason text not null default '', starts_at timestamptz not null default now(), ends_at timestamptz, revoked_at timestamptz,
 check(num_nonnulls(student_id,staff_id)=1), check(ends_at is null or ends_at>starts_at)
);
create index on private.bms_grants(unit_id,student_id);
create index on private.bms_grants(unit_id,staff_id);
create table private.bms_tasks (
 id uuid primary key default gen_random_uuid(), unit_id uuid not null references private.bms_units(id),
 title text not null check(length(trim(title)) between 1 and 200), description text not null default '',
 priority text not null default 'normal' check(priority in ('low','normal','high','urgent')), due_date date, created_at timestamptz not null default now()
);
create table private.bms_deliveries (
 task_id uuid not null references private.bms_tasks(id), student_id uuid not null references public.students(id) on delete cascade,
 state text not null default 'todo' check(state in ('todo','doing','review','changes','done')),
 submission text not null default '', feedback text not null default '', score integer check(score between 0 and 100),
 updated_at timestamptz not null default now(), primary key(task_id,student_id)
);
create table private.bms_applications (
 unit_id uuid not null references private.bms_units(id), student_id uuid not null references public.students(id) on delete cascade,
 motivation text not null, state text not null default 'pending' check(state in ('pending','accepted','rejected')),
 created_at timestamptz not null default now(), primary key(unit_id,student_id)
);
create table private.bms_audit (
 id bigint generated always as identity primary key, unit_id uuid references private.bms_units(id),
 student_actor uuid, staff_actor uuid, action text not null, detail jsonb not null default '{}', created_at timestamptz not null default now()
);
create table private.bms_expenses (
 id uuid primary key default gen_random_uuid(), unit_id uuid not null references private.bms_units(id),
 title text not null check(length(trim(title)) between 1 and 200), amount numeric(12,2) not null check(amount>0),
 created_at timestamptz not null default now()
);
create table private.bms_leave (
 id uuid primary key default gen_random_uuid(), unit_id uuid not null references private.bms_units(id), student_id uuid not null references public.students(id) on delete cascade,
 starts date not null, ends date not null, reason text not null, state text not null default 'pending' check(state in ('pending','accepted','rejected')),
 check(ends>=starts)
);
create table private.bms_attendance (
 unit_id uuid not null references private.bms_units(id), student_id uuid not null references public.students(id) on delete cascade,
 day date not null, status text not null check(status in ('present','absent','excused')), primary key(unit_id,student_id,day)
);
alter table private.bms_units enable row level security;
alter table private.bms_grants enable row level security;
alter table private.bms_tasks enable row level security;
alter table private.bms_deliveries enable row level security;
alter table private.bms_applications enable row level security;
alter table private.bms_audit enable row level security;
alter table private.bms_expenses enable row level security;
alter table private.bms_leave enable row level security;
alter table private.bms_attendance enable row level security;
revoke all on private.bms_units,private.bms_grants,private.bms_tasks,private.bms_deliveries,private.bms_applications,private.bms_audit,private.bms_expenses,private.bms_leave,private.bms_attendance from public,anon,authenticated;
insert into private.bms_units(name,kind) values('Technical Division','technical'),('Non-Technical Division','nontechnical'),('Competitions & Innovation','competition');
create function private.bms_scope(p_unit uuid,p_student uuid,p_staff uuid,p_cap text) returns boolean
language sql stable security definer set search_path='' as $$
 with recursive a(id,parent_id) as (
  select id,parent_id from private.bms_units where id=p_unit and not archived
  union select u.id,u.parent_id from private.bms_units u join a on a.parent_id=u.id where not u.archived
 )
 select exists(select 1 from a join private.bms_grants g on g.unit_id=a.id
 where ((p_student is not null and g.student_id=p_student) or (p_staff is not null and g.staff_id=p_staff))
 and g.revoked_at is null and g.starts_at<=now() and (g.ends_at is null or g.ends_at>now())
 and (g.role in ('head','co_head','leader','supervisor','captain','coordinator')
 or (p_cap in ('view','review') and g.role='reviewer')
 or (p_cap='view' and g.role in ('watcher','instructor'))
 or (p_cap='self' and g.unit_id=p_unit)))
$$;
revoke all on function private.bms_scope(uuid,uuid,uuid,text) from public,anon,authenticated;
-- All RPC operations use verified student session or existing staff MFA guard, never caller-supplied actor IDs.
create function public.buildx_management(p_op text,p_payload jsonb default '{}',p_token text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_student uuid; v_staff uuid; v_owner boolean:=false; v_unit uuid; v_id uuid; v_member uuid; v_staff_target uuid;
 v_role text; v_manage boolean; v_review boolean; v_view boolean; v_self boolean;
 v_state text; v_title text; v_group uuid; v_n int; v_i int:=0; v_chunk int; v_rec record; v_result jsonb;
begin
 if p_token is not null then
  v_student:=private.session_student(p_token);
  if v_student is null or not exists(select 1 from public.students where id=v_student and active) then raise exception 'session_invalid' using errcode='42501'; end if;
 elsif private.is_staff() then v_staff:=auth.uid(); v_owner:=private.is_owner();
 else raise exception 'not allowed' using errcode='42501'; end if;
 if p_op<>'read' then perform pg_advisory_xact_lock(8241186110); end if;
 v_unit:=nullif(p_payload->>'unit','')::uuid;
 v_manage:=v_owner or private.bms_scope(v_unit,v_student,v_staff,'manage');
 v_review:=v_owner or private.bms_scope(v_unit,v_student,v_staff,'review');
 v_view:=v_owner or private.bms_scope(v_unit,v_student,v_staff,'view');
 v_self:=private.bms_scope(v_unit,v_student,v_staff,'self');
 if p_op='read' then
  return jsonb_build_object(
   'owner',v_owner,'student',v_student,'staff',v_staff,
   'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'kind',u.kind,'parent_id',u.parent_id,'applications_open',u.applications_open,'archived',u.archived,'deadline',u.deadline,'budget',case when v_owner or private.bms_scope(u.id,v_student,v_staff,'view') then u.budget end,'manage',v_owner or private.bms_scope(u.id,v_student,v_staff,'manage'),'review',v_owner or private.bms_scope(u.id,v_student,v_staff,'review'),'view',v_owner or private.bms_scope(u.id,v_student,v_staff,'view')) order by u.name) from private.bms_units u where v_owner or (not u.archived and (private.bms_scope(u.id,v_student,v_staff,'view') or private.bms_scope(u.id,v_student,v_staff,'self') or (v_student is not null and u.kind='competition' and (u.applications_open or exists(select 1 from private.bms_applications a where a.unit_id=u.id and a.student_id=v_student)))))), '[]'),
   'students',case when v_owner then coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',full_name,'group',group_name) order by full_name) from public.students where active),'[]') else '[]' end,
   'staff_list',case when v_owner then coalesce((select jsonb_agg(jsonb_build_object('id',user_id,'name',private.staff_name(user_id)) order by private.staff_name(user_id)) from public.staff where active),'[]') else '[]' end,
   'grants',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'student_id',g.student_id,'staff_id',g.staff_id,'name',coalesce(s.full_name,private.staff_name(g.staff_id)),'role',g.role,'ends_at',g.ends_at,'reason',g.reason) order by g.role) from private.bms_grants g left join public.students s on s.id=g.student_id where g.unit_id=v_unit and g.revoked_at is null and (g.ends_at is null or g.ends_at>now()) and (v_view or g.student_id=v_student or g.staff_id=v_staff)),'[]'),
   'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'student_id',d.student_id,'name',s.full_name,'title',t.title,'description',t.description,'priority',t.priority,'due_date',t.due_date,'state',d.state,'submission',d.submission,'feedback',d.feedback,'score',d.score,'updated_at',d.updated_at) order by t.created_at desc) from private.bms_tasks t join private.bms_deliveries d on d.task_id=t.id join public.students s on s.id=d.student_id where t.unit_id=v_unit and (v_view or d.student_id=v_student)),'[]'),
   'applications',coalesce((select jsonb_agg(jsonb_build_object('student_id',a.student_id,'name',s.full_name,'motivation',a.motivation,'state',a.state)) from private.bms_applications a join public.students s on s.id=a.student_id where a.unit_id=v_unit and (v_manage or a.student_id=v_student)),'[]'),
   'expenses',case when v_view then coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from private.bms_expenses e where e.unit_id=v_unit),'[]') else '[]' end,
   'leave',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('name',s.full_name)) from private.bms_leave l join public.students s on s.id=l.student_id where l.unit_id=v_unit and (v_view or l.student_id=v_student)),'[]'),
   'attendance',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('name',s.full_name)) from private.bms_attendance a join public.students s on s.id=a.student_id where a.unit_id=v_unit and (v_view or a.student_id=v_student) and a.day>=current_date-90),'[]'),
   'audit',case when v_owner then coalesce((select jsonb_agg(to_jsonb(x)) from (select action,created_at,detail from private.bms_audit where unit_id=v_unit order by id desc limit 100)x),'[]') else '[]' end
  );
 end if;
 if p_op in ('create','grant','revoke','split','edit') and not v_owner then raise exception 'not allowed' using errcode='42501'; end if;
 if p_op in ('task','decide','applications','expense','attendance','leave_decide') and not v_manage then raise exception 'not allowed' using errcode='42501'; end if;
 if p_op='create' then
  insert into private.bms_units(name,kind,parent_id,applications_open,deadline,budget) values(trim(p_payload->>'name'),p_payload->>'kind',v_unit,coalesce((p_payload->>'open')::boolean,false),nullif(p_payload->>'deadline','')::date,coalesce((p_payload->>'budget')::numeric,0)) returning id into v_unit;
 elsif p_op='edit' then
  update private.bms_units set name=trim(p_payload->>'name'),deadline=nullif(p_payload->>'deadline','')::date,budget=coalesce((p_payload->>'budget')::numeric,0),archived=coalesce((p_payload->>'archived')::boolean,false) where id=v_unit;
 elsif p_op='grant' then
  v_member:=nullif(p_payload->>'student_id','')::uuid; v_staff_target:=nullif(p_payload->>'staff_id','')::uuid; v_role:=p_payload->>'role';
  if v_member is not null and not exists(select 1 from public.students where id=v_member and active) then raise exception 'invalid student'; end if;
  if v_staff_target is not null and not exists(select 1 from public.staff where user_id=v_staff_target and active) then raise exception 'invalid staff'; end if;
  if not exists(select 1 from private.bms_grants g where unit_id=v_unit and student_id is not distinct from v_member and staff_id is not distinct from v_staff_target and role=v_role and revoked_at is null and (ends_at is null or ends_at>now())) then
   insert into private.bms_grants(unit_id,student_id,staff_id,role,reason,ends_at) values(v_unit,v_member,v_staff_target,v_role,left(coalesce(p_payload->>'reason',''),500),(nullif(p_payload->>'ends','')::date+interval '1 day') at time zone 'Africa/Cairo');
  end if;
 elsif p_op='revoke' then
  update private.bms_grants set revoked_at=now() where unit_id=v_unit and id=(p_payload->>'id')::uuid and revoked_at is null;
 elsif p_op='split' then
  v_chunk:=(p_payload->>'size')::int; if v_chunk not between 2 and 100 then raise exception 'invalid group size'; end if;
  -- Distribute only explicitly selected active members; no invented appointments.
  for v_rec in select distinct s.id,s.full_name from public.students s where s.active and s.id in (select value::uuid from jsonb_array_elements_text(p_payload->'students')) order by s.full_name,s.id loop
   if mod(v_i,v_chunk)=0 then insert into private.bms_units(name,kind,parent_id) values(left(coalesce(nullif(trim(p_payload->>'prefix'),''),'Group'),90)||' '||(v_i/v_chunk+1),'group',v_unit) returning id into v_group; end if;
   insert into private.bms_grants(unit_id,student_id,role,reason) values(v_group,v_rec.id,'member','Group distribution');
   v_i:=v_i+1;
  end loop;
 elsif p_op='applications' then
  update private.bms_units set applications_open=coalesce((p_payload->>'open')::boolean,false) where id=v_unit and kind='competition' and not archived;
 elsif p_op='task' then
  v_title:=trim(p_payload->>'title'); v_member:=nullif(p_payload->>'student_id','')::uuid;
  insert into private.bms_tasks(unit_id,title,description,priority,due_date) values(v_unit,v_title,left(coalesce(p_payload->>'description',''),10000),coalesce(p_payload->>'priority','normal'),nullif(p_payload->>'due','')::date) returning id into v_id;
  insert into private.bms_deliveries(task_id,student_id) select distinct v_id,g.student_id from private.bms_grants g join public.students s on s.id=g.student_id and s.active where g.unit_id=v_unit and g.revoked_at is null and (g.ends_at is null or g.ends_at>now()) and (v_member is null or g.student_id=v_member);
  get diagnostics v_n=row_count; if v_n=0 then raise exception 'no active recipients'; end if;
 elsif p_op='submit' then
  if v_student is null then raise exception 'not allowed'; end if;
  v_state:=p_payload->>'state'; if v_state not in ('doing','review') or (v_state='review' and length(trim(coalesce(p_payload->>'submission','')))=0) then raise exception 'invalid submission'; end if;
  update private.bms_deliveries d set state=v_state,submission=left(coalesce(p_payload->>'submission',''),10000),updated_at=now() from private.bms_tasks t where t.id=d.task_id and t.unit_id=v_unit and d.task_id=(p_payload->>'id')::uuid and d.student_id=v_student and d.state in ('todo','doing','changes');
  if not found then raise exception 'not allowed'; end if;
 elsif p_op='review' then
  if not v_review then raise exception 'not allowed'; end if;
  v_member:=(p_payload->>'student_id')::uuid; v_state:=p_payload->>'state';
  if v_member=v_student or v_state not in ('done','changes') or length(trim(coalesce(p_payload->>'feedback','')))=0 then raise exception 'not allowed'; end if;
  update private.bms_deliveries d set state=v_state,feedback=left(p_payload->>'feedback',3000),score=nullif(p_payload->>'score','')::integer,updated_at=now() from private.bms_tasks t where t.id=d.task_id and t.unit_id=v_unit and d.task_id=(p_payload->>'id')::uuid and d.student_id=v_member and d.state='review';
  if not found then raise exception 'not allowed'; end if;
 elsif p_op='apply' then
  if v_student is null or not exists(select 1 from private.bms_units where id=v_unit and kind='competition' and applications_open and not archived) then raise exception 'not allowed'; end if;
  insert into private.bms_applications(unit_id,student_id,motivation) values(v_unit,v_student,left(trim(p_payload->>'motivation'),2000));
 elsif p_op='decide' then
  v_member:=(p_payload->>'student_id')::uuid; v_state:=p_payload->>'state';
  if v_member=v_student or v_state not in ('accepted','rejected') then raise exception 'not allowed'; end if;
  update private.bms_applications set state=v_state where unit_id=v_unit and student_id=v_member and state='pending'; if not found then raise exception 'not allowed'; end if;
  if v_state='accepted' and not exists(select 1 from private.bms_grants where unit_id=v_unit and student_id=v_member and role='member' and revoked_at is null and (ends_at is null or ends_at>now())) then insert into private.bms_grants(unit_id,student_id,role,reason) values(v_unit,v_member,'member','Competition application'); end if;
 elsif p_op='expense' then
  insert into private.bms_expenses(unit_id,title,amount) values(v_unit,trim(p_payload->>'title'),(p_payload->>'amount')::numeric);
 elsif p_op='attendance' then
  v_member:=(p_payload->>'student_id')::uuid;
  if not exists(select 1 from private.bms_grants g where g.unit_id=v_unit and g.student_id=v_member and g.revoked_at is null and (g.ends_at is null or g.ends_at>now())) then raise exception 'not allowed'; end if;
  insert into private.bms_attendance(unit_id,student_id,day,status) values(v_unit,v_member,(p_payload->>'day')::date,p_payload->>'state') on conflict(unit_id,student_id,day) do update set status=excluded.status;
 elsif p_op='leave' then
  if v_student is null or not v_self then raise exception 'not allowed'; end if;
  insert into private.bms_leave(unit_id,student_id,starts,ends,reason) values(v_unit,v_student,(p_payload->>'starts')::date,(p_payload->>'ends')::date,left(trim(p_payload->>'reason'),2000));
 elsif p_op='leave_decide' then
  v_state:=p_payload->>'state'; if v_state not in ('accepted','rejected') then raise exception 'invalid state'; end if;
  update private.bms_leave set state=v_state where unit_id=v_unit and id=(p_payload->>'id')::uuid and student_id is distinct from v_student and state='pending'; if not found then raise exception 'not allowed'; end if;
 else raise exception 'unknown operation';
 end if;
 -- No student session tokens or private submission content in the audit.
 insert into private.bms_audit(unit_id,student_actor,staff_actor,action,detail) values(v_unit,v_student,v_staff,p_op,jsonb_build_object('target',p_payload->>'student_id','role',p_payload->>'role','record',p_payload->>'id'));
 return jsonb_build_object('ok',true,'unit',v_unit);
end $$;
revoke all on function public.buildx_management(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.buildx_management(text,jsonb,text) to anon,authenticated;
