import { hasDatabase } from "@/server/env";
import { requestContextFrom } from "@/server/observability/request";
import { issueFormToken } from "@/server/security/forms";
import { limit } from "@/server/security/rate-limit";

/** Fresh signed form token for statically cached pages (join/contact). */
export async function GET(req: Request) {
  const form = new URL(req.url).searchParams.get("form");
  if (form !== "join" && form !== "contact") return Response.json({ error: "bad_form" }, { status: 400 });
  if (!hasDatabase()) return Response.json({ token: null, disabled: true }, { headers: { "Cache-Control": "no-store" } });
  const rl = await limit("search", `token:${requestContextFrom(req).ip ?? "unknown"}`);
  if (!rl.ok) return Response.json({ error: "rate_limited" }, { status: 429 });
  return Response.json({ token: issueFormToken(form) }, { headers: { "Cache-Control": "no-store" } });
}
