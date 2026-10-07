// Sends a BuildX App push notification. Called from the app by an owner/admin with their own session:
// the message is created through staff_push_create (which checks the role and two-factor), then the
// devices and the VAPID key are read with the service role and the push is delivered with web-push.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const ORIGINS = ["https://buildxhue.com", "https://www.buildxhue.com", "http://buildxhue.com", "http://localhost:4173"];

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

type Targets = {
  message: { id: string; title: string; body: string; url: string | null };
  vapid: { public: string; private: string; subject: string };
  subs: { endpoint: string; keys: { p256dh: string; auth: string } }[];
};

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

  // 2. Devices and key, with the service role.
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const t = await admin.rpc("push_targets", { p_message: id });
  if (t.error || !t.data) return new Response(JSON.stringify({ error: "targets", detail: t.error?.message }), { status: 500, headers });
  const { message, vapid, subs } = t.data as Targets;
  if (!vapid.private || !vapid.public) return new Response(JSON.stringify({ error: "not_configured" }), { status: 500, headers });
  webpush.setVapidDetails(vapid.subject || "https://buildxhue.com", vapid.public, vapid.private);

  // 3. Deliver, 50 at a time.
  const payload = JSON.stringify({ title: message.title, body: message.body, url: message.url ?? "/app/" });
  let delivered = 0;
  const gone: string[] = [];
  for (let i = 0; i < subs.length; i += 50) {
    const batch = subs.slice(i, i + 50);
    const results = await Promise.allSettled(batch.map((s) => webpush.sendNotification(s, payload, { TTL: 86400, urgency: "normal" })));
    results.forEach((r, j) => {
      if (r.status === "fulfilled") delivered++;
      else {
        const code = (r.reason as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) gone.push(batch[j].endpoint);
      }
    });
  }
  await admin.rpc("push_report", { p_message: id, p_targets: subs.length, p_delivered: delivered, p_gone: gone });
  return new Response(JSON.stringify({ ok: true, id, targets: subs.length, delivered }), { headers });
});
