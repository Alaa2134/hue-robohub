import "server-only";
import { sql } from "drizzle-orm";
import type { Actor } from "@/server/auth/guard";
import { db } from "@/server/db";

export const leadership = ["head","co_head","leader","supervisor","captain","coordinator"] as const;
export function isBmsAdmin(actor: Actor) { return actor.role === "owner" || actor.role === "admin"; }
export function activeGrant() { return sql`g.revoked_at is null and g.starts_at <= now() and (g.ends_at is null or g.ends_at > now())`; }
// An inactive or unlinked member cannot use a scoped appointment.
export function activeMember(actor: Actor) { return sql`exists (select 1 from public.members m where m.id = ${actor.memberId}::uuid and m.status = 'active')`; }
// Descendant scope only: no permission travels sideways or up the tree.
export function scope(actor: Actor, unitId: string, capability: "manage" | "review" | "view") {
  if (isBmsAdmin(actor)) return sql`true`;
  const roles = capability === "manage" ? sql`('head','co_head','leader','supervisor','captain','coordinator')` :
    capability === "review" ? sql`('head','co_head','leader','supervisor','captain','coordinator','reviewer')` :
    sql`('head','co_head','leader','supervisor','captain','coordinator','reviewer','watcher','instructor')`;
  return sql`(${activeMember(actor)} and exists (
    with recursive ancestors(id,parent_id) as (
      select id,parent_id from bms.units where id = ${unitId}::uuid
      union select u.id,u.parent_id from bms.units u join ancestors a on a.parent_id=u.id
    ) select 1 from bms.memberships g join ancestors a on a.id=g.unit_id
    where g.member_id=${actor.memberId}::uuid and ${activeGrant()} and g.role in ${roles}
  ))`;
}
export type Unit = { id:string; name:string; kind:string; parent_id:string|null; applications_open:boolean; competition_id:string|null };
export async function visibleUnits(actor: Actor) {
  return db.execute<Unit>(sql`with recursive permitted(id) as (
    select g.unit_id from bms.memberships g where g.member_id=${actor.memberId}::uuid and ${activeMember(actor)} and ${activeGrant()}
    union select u.id from bms.units u join permitted p on p.id=u.parent_id
    where exists (with recursive a(id,parent_id) as (select id,parent_id from bms.units where id=u.id union select x.id,x.parent_id from bms.units x join a on x.id=a.parent_id)
      select 1 from bms.memberships g join a on a.id=g.unit_id where g.member_id=${actor.memberId}::uuid and ${activeGrant()} and g.role <> 'member')
  ) select * from bms.units u where ${isBmsAdmin(actor)} or u.id in (select id from permitted) or (u.applications_open and ${activeMember(actor)})
    order by u.kind,u.name`);
}
