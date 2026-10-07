// One-time upload URL for a student's task file. Students have no Supabase Auth account, so the
// database checks their app session and the task (student_upload_ticket, service role only) and
// hands back the storage path; this function then signs an upload URL for that exact path in the
// private "submissions" bucket. The file itself goes straight from the phone to storage.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// The site, and the store apps (Android serves from https://localhost, iOS from capacitor://localhost).
const ORIGINS = ["https://buildxhue.com", "https://www.buildxhue.com", "http://buildxhue.com", "http://localhost:4173", "https://localhost", "capacitor://localhost"];

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

Deno.serve(async (req) => {
  const headers = { ...cors(req), "Content-Type": "application/json" };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return reply({ error: "method" }, 405);

  let input: { token?: unknown; assignment?: unknown; ext?: unknown; size?: unknown };
  try {
    input = await req.json();
  } catch {
    return reply({ error: "invalid" }, 400);
  }
  const token = typeof input.token === "string" ? input.token : "";
  const assignment = typeof input.assignment === "string" ? input.assignment : "";
  if (!/^[0-9a-f]{64}$/.test(token) || !/^[0-9a-f-]{36}$/i.test(assignment)) return reply({ error: "invalid" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  // The database checks the session and the task, and limits uploads per student.
  const ticket = await admin.rpc("student_upload_ticket", {
    p_token: token,
    p_assignment: assignment,
    p_ext: typeof input.ext === "string" ? input.ext.slice(0, 10) : "",
    p_size: typeof input.size === "number" ? Math.floor(input.size) : 0,
  });
  if (ticket.error) {
    const session = /session_invalid/.test(ticket.error.message);
    return reply({ error: session ? "session_invalid" : "failed" }, session ? 401 : 500);
  }
  const t = ticket.data as { ok: boolean; error?: string; path?: string };
  if (!t.ok || !t.path) return reply({ error: t.error ?? "failed" }, 400);

  const signed = await admin.storage.from("submissions").createSignedUploadUrl(t.path);
  if (signed.error || !signed.data) return reply({ error: "failed" }, 500);
  return reply({ ok: true, path: t.path, token: signed.data.token });
});
