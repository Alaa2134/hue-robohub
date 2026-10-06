import { sql } from "drizzle-orm";
import { db } from "@/server/db";

/**
 * Cheap change-detector for public listings so open pages can refresh themselves after a publish.
 * Cached briefly at the CDN; a single indexed aggregate per scope.
 */
const SCOPES = {
  members: sql`select coalesce(max(updated_at), 'epoch')::text || ':' || count(*)::text as v from members where public_profile`,
  projects: sql`select coalesce(max(updated_at), 'epoch')::text || ':' || count(*)::text as v from projects where published`,
  events: sql`select coalesce(max(updated_at), 'epoch')::text || ':' || count(*)::text as v from events where public`,
} as const;

export async function GET(req: Request) {
  const scope = new URL(req.url).searchParams.get("scope") as keyof typeof SCOPES | null;
  if (!scope || !(scope in SCOPES)) return Response.json({ error: "unknown scope" }, { status: 400 });
  const [row] = await db.execute<{ v: string }>(SCOPES[scope]);
  return Response.json(
    { v: row?.v ?? "0" },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=10, stale-while-revalidate=30" } },
  );
}
