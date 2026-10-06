import { hasDatabase } from "@/server/env";
import { searchPublic } from "@/server/queries/search";
import { limit } from "@/server/security/rate-limit";
import { requestContextFrom } from "@/server/observability/request";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2 || !hasDatabase()) return Response.json({ results: [] });
  const ctx = requestContextFrom(req);
  const rl = await limit("search", ctx.ip ?? "unknown");
  if (!rl.ok) return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } });
  const results = await searchPublic(q.toLowerCase());
  return Response.json({ results }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" } });
}
