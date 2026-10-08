// Sends a BuildX App push notification. Called from the app by a team member who may send them, with
// their own session: the message is created through staff_push_create (which checks the permission
// and two-factor), then it is delivered to browsers and phones like every other notification.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { deliver, type Targets } from "../_shared/deliver.ts";

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
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method" }), { status: 405, headers });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  let input: { title?: string; body?: string; url?: string; audience?: string; group?: string };
  try {
    input = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid" }), { status: 400, headers });
  }

  // 1. Create the message as the caller: the database decides whether they may send.
  const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
  const created = await caller.rpc("staff_push_create", {
    p_title: input.title ?? "",
    p_body: input.body ?? "",
    p_url: input.url ?? "",
    p_audience: input.audience ?? "",
    p_group: input.group ?? null,
  });
  if (created.error) {
    const forbidden = created.error.code === "42501";
    return new Response(JSON.stringify({ error: forbidden ? "forbidden" : "invalid", detail: created.error.message }), { status: forbidden ? 403 : 400, headers });
  }
  const id = created.data as string;

  // 2. Browsers and phones, with the service role.
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const t = await admin.rpc("push_targets", { p_message: id });
  const n = await admin.rpc("push_native_targets", { p_message: id });
  if (t.error || !t.data) return new Response(JSON.stringify({ error: "targets", detail: t.error?.message }), { status: 500, headers });
  const targets = { ...(t.data as Targets), native: (n.data ?? undefined) as Targets["native"] };
  if (!targets.vapid.private && !targets.native?.fcm && !targets.native?.apns.key) return new Response(JSON.stringify({ error: "not_configured" }), { status: 500, headers });

  // 3. Deliver.
  const out = await deliver(targets, "normal");
  await admin.rpc("push_report_all", { p_message: id, p_targets: out.targets, p_delivered: out.delivered, p_gone: out.gone, p_gone_native: out.goneNative });
  return new Response(JSON.stringify({ ok: true, id, targets: out.targets, delivered: out.delivered }), { headers });
});
