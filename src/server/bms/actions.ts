"use server";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePage } from "@/server/auth/guard";
import { db } from "@/server/db";
import { activeGrant, activeMember, isBmsAdmin, scope } from "@/server/bms/access";
const roles = ["member","head","co_head","leader","supervisor","captain","coordinator","reviewer","watcher","instructor"] as const;
const kinds = ["technical","nontechnical","competition","sector","group","project","responsibility"] as const;
const uuid = z.string().uuid();
const str = (f:FormData,k:string) => String(f.get(k)??"").trim();
const text = (f:FormData,k:string,max:number) => z.string().max(max).parse(str(f,k));
const required = (f:FormData,k:string,max:number) => z.string().min(1).max(max).parse(str(f,k));
const optionalId = (f:FormData,k:string) => str(f,k) ? uuid.parse(str(f,k)) : null;
const date = (f:FormData,k:string) => str(f,k) ? z.iso.date().parse(str(f,k)) : null;
class Denied extends Error {}
export async function bmsAction(f:FormData) {
  const actor = await requirePage("dashboard.view");
  let target = "";
  let error = "";
  try {
    const op = str(f,"op");
    const unit = optionalId(f,"unit");
    target=unit??"";
    await db.transaction(async tx=>{
      // Serialize mutations so that a revocation cannot race an authorization check.
      await tx.execute(sql`select pg_advisory_xact_lock(8241186005)`);
      const admin=isBmsAdmin(actor);
      const requireAdmin=()=>{if(!admin)throw new Denied("Administrative permission required.");};
      const check=async(cap:"manage"|"review"|"view")=>{
        if(!unit) throw new Denied("Select a team first.");
        const [r]=await tx.execute<{allowed:boolean}>(sql`select ${scope(actor,unit,cap)} as allowed`);
        if(!r?.allowed)throw new Denied("You do not have permission in this team.");
      };
      const member=actor.memberId;
      const checkMember=async(id:string)=>{
        const [r]=await tx.execute(sql`select id from public.members where id=${id}::uuid and status='active'`);
        if(!r)throw new Denied("Choose an active member.");
      };
      const audit=async(action:string,detail:string,u=unit)=>{await tx.execute(sql`insert into bms.audit(actor_id,unit_id,action,detail) values(${actor.userId}::uuid,${u}::uuid,${action},${detail})`);};
      const notify=async(id:string,title:string,body:string)=>{await tx.execute(sql`insert into public.notifications(user_id,kind,title,body,href) select id,'bms',${title},${body},${"/command/bms?unit="+(unit??"")} from public.users where member_id=${id}::uuid and status='active'`);};
      if(op==="unit"){
        requireAdmin();
        const kind=z.enum(kinds).parse(str(f,"kind"));
        const name=required(f,"name",120), comp=optionalId(f,"competition");
        const [u]=await tx.execute<{id:string}>(sql`insert into bms.units(name,kind,parent_id,competition_id,applications_open) values(${name},${kind},${unit}::uuid,${comp}::uuid,${kind==="competition"&&str(f,"open")==="on"}) returning id`);
        target=u!.id; await audit("unit.created",name,target);
      }else if(op==="applications"){
        await check("manage");
        await tx.execute(sql`update bms.units set applications_open=${str(f,"open")==="on"} where id=${unit}::uuid and kind='competition'`);
        await audit("applications.changed",str(f,"open"));
      }else if(op==="grant"){
        requireAdmin(); if(!unit)throw new Denied("Select a team.");
        const id=uuid.parse(str(f,"member")),role=z.enum(roles).parse(str(f,"role")),end=date(f,"ends");
        await checkMember(id);
        const reason=text(f,"reason",500);
        const [existing]=await tx.execute(sql`select id from bms.memberships g where g.unit_id=${unit}::uuid and g.member_id=${id}::uuid and g.role=${role} and ${activeGrant()}`);
        if(existing)throw new Denied("This appointment already exists.");
        await tx.execute(sql`insert into bms.memberships(unit_id,member_id,role,ends_at,reason,assigned_by) values(${unit}::uuid,${id}::uuid,${role},(${end}::date + interval '1 day') at time zone 'Africa/Cairo',${reason},${actor.userId}::uuid)`);
        await audit("appointment.granted",id+" "+role+" "+reason);await notify(id,"BuildX appointment",role);
      }else if(op==="revoke"){
        requireAdmin();
        const grant=uuid.parse(str(f,"grant"));
        const [r]=await tx.execute<{member_id:string;role:string}>(sql`update bms.memberships set revoked_at=now() where id=${grant}::uuid and unit_id=${unit}::uuid and revoked_at is null returning member_id,role`);
        if(!r)throw new Denied("Appointment not found.");
        await audit("appointment.revoked",r.member_id+" "+r.role);await notify(r.member_id,"BuildX appointment ended",r.role);
      }else if(op==="task"){
        await check("manage");
        const title=required(f,"title",200),description=text(f,"description",10000),priority=z.enum(["low","medium","high","critical"]).parse(str(f,"priority")),due=date(f,"due");
        const assignee=optionalId(f,"member");
        const [t]=await tx.execute<{id:string}>(sql`insert into bms.tasks(unit_id,title,description,priority,due_date,created_by) values(${unit}::uuid,${title},${description},${priority},${due}::date,${actor.userId}::uuid) returning id`);
        const assigned=await tx.execute<{member_id:string}>(sql`insert into bms.deliveries(task_id,member_id) select distinct ${t!.id}::uuid,g.member_id from bms.memberships g join public.members m on m.id=g.member_id where g.unit_id=${unit}::uuid and m.status='active' and ${activeGrant()} and (${assignee}::uuid is null or g.member_id=${assignee}::uuid) returning member_id`);
        if(!assigned.length)throw new Denied("No active recipients in this team.");
        await audit("task.assigned",t!.id+" "+assigned.length);
        for(const a of assigned)await notify(a.member_id,"New BuildX task",title);
      }else if(op==="submit"||op==="review"){
        const task=uuid.parse(str(f,"task")),id=op==="submit"?member:uuid.parse(str(f,"member"));
        if(!id)throw new Denied("No linked member account.");
        const [r]=await tx.execute<{state:string;title:string}>(sql`select d.state,t.title from bms.deliveries d join bms.tasks t on t.id=d.task_id where t.id=${task}::uuid and t.unit_id=${unit}::uuid and d.member_id=${id}::uuid`);
        if(!r)throw new Denied("Task not found.");
        if(op==="submit"){
          await checkMember(id);
          if(!["todo","in_progress","changes"].includes(r.state))throw new Denied("This task is not open for submission.");
          const state=z.enum(["in_progress","review"]).parse(str(f,"state"));
          const submission=state==="review"?required(f,"submission",10000):text(f,"submission",10000);
          await tx.execute(sql`update bms.deliveries set state=${state},submission=${submission},updated_at=now() where task_id=${task}::uuid and member_id=${id}::uuid`);
          await audit("task."+state,task+" "+id);
        }else{
          await check("review");if(id===member)throw new Denied("You cannot review your own work.");
          if(r.state!=="review")throw new Denied("Only submitted tasks can be reviewed.");
          const state=z.enum(["changes","done"]).parse(str(f,"state")),feedback=required(f,"feedback",3000),score=str(f,"score")?z.coerce.number().int().min(0).max(100).parse(str(f,"score")):null;
          await tx.execute(sql`update bms.deliveries set state=${state},feedback=${feedback},score=${score},reviewed_by=${actor.userId}::uuid,updated_at=now() where task_id=${task}::uuid and member_id=${id}::uuid`);
          await audit("task."+state,task+" "+id);await notify(id,"BuildX task reviewed",r.title);
        }
      }else if(op==="apply"){
        if(!member)throw new Denied("No linked member account.");await checkMember(member);
        const [r]=await tx.execute(sql`insert into bms.applications(unit_id,member_id,motivation) select id,${member}::uuid,${required(f,"motivation",2000)} from bms.units where id=${unit}::uuid and kind='competition' and applications_open on conflict do nothing returning unit_id`);
        if(!r)throw new Denied("Applications closed or already submitted.");
        await audit("competition.applied",member);
      }else if(op==="decide"){
        await check("manage");
        const id=uuid.parse(str(f,"member")),status=z.enum(["accepted","rejected"]).parse(str(f,"state"));
        if(id===member)throw new Denied("You cannot approve your own application.");
        await checkMember(id);
        const [r]=await tx.execute(sql`update bms.applications set status=${status},decided_by=${actor.userId}::uuid where unit_id=${unit}::uuid and member_id=${id}::uuid and status='pending' returning unit_id`);
        if(!r)throw new Denied("No pending application.");
        if(status==="accepted"){
          await tx.execute(sql`insert into bms.memberships(unit_id,member_id,role,reason,assigned_by) select ${unit}::uuid,${id}::uuid,'member','Competition application',${actor.userId}::uuid where not exists(select 1 from bms.memberships g where unit_id=${unit}::uuid and member_id=${id}::uuid and role='member' and ${activeGrant()})`);
          await tx.execute(sql`insert into public.competition_members(competition_id,member_id,role) select competition_id,${id}::uuid,'Team member' from bms.units where id=${unit}::uuid and competition_id is not null on conflict do nothing`);
        }
        await audit("competition."+status,id);await notify(id,"Competition application",status);
      }else throw new Denied("Unknown operation.");
    });
  } catch(e) {error=e instanceof Denied?e.message:e instanceof z.ZodError?"Please check the entered values.":"The operation could not be saved. Check the database configuration."; }
  revalidatePath("/command/bms");
  redirect("/command/bms?"+new URLSearchParams({...(target?{unit:target}:{}),...(error?{error}:{saved:"1"})}).toString());
}
