// Delivers the team notifications the database raises by itself (a new join application, a site
// message, a draft waiting to be published, the monthly report): private.notify_staff() writes the
// message with a one-time token and calls this function with it. Only the database knows the token,
// so nobody else can make it send anything; the token is used up on the first call.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type Targets = {
  message: { id: string; title: string; body: string; url: string | null };
  vapid: { public: string; private: string; subject: string };
  subs: { endpoint: string; keys: { p256dh: string; auth: string } }[];
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let input: { id?: string; token?: string };
  try {
    input = await req.json();
  } catch {
    return json({ error: "invalid" }, 400);
  }
  if (!input.id || !input.token) return json({ error: "invalid" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const t = await admin.rpc("push_deliver_claim", { p_id: input.id, p_token: input.token });
  if (t.error) return json({ error: "server" }, 500);
  if (!t.data) return json({ error: "forbidden" }, 403);
  const { message, vapid, subs } = t.data as Targets;
  if (!vapid.private || !vapid.public) return json({ error: "not_configured" }, 500);
  webpush.setVapidDetails(vapid.subject || "https://buildxhue.com", vapid.public, vapid.private);

  const payload = JSON.stringify({ title: message.title, body: message.body, url: message.url ?? "/app/" });
  let delivered = 0;
  const gone: string[] = [];
  for (let i = 0; i < subs.length; i += 50) {
    const batch = subs.slice(i, i + 50);
    const results = await Promise.allSettled(batch.map((s) => webpush.sendNotification(s, payload, { TTL: 86400, urgency: "high" })));
    results.forEach((r, j) => {
      if (r.status === "fulfilled") delivered++;
      else {
        const code = (r.reason as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) gone.push(batch[j].endpoint);
      }
    });
  }
  await admin.rpc("push_report", { p_message: message.id, p_targets: subs.length, p_delivered: delivered, p_gone: gone });
  return json({ ok: true, targets: subs.length, delivered });
});
