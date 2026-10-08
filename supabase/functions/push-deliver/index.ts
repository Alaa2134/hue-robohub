// Delivers the notifications the database raises by itself (team: a new join application, a site
// message, a draft waiting to be published, the monthly report; students: new content, quizzes,
// tasks, announcements, session reminders) and the ones staff send from the app (via send-push).
// The database writes the message with a one-time token and calls this function with it. Only the
// database knows the token, so nobody else can make it send anything; it is used up on the first call.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { deliver, type Targets } from "../_shared/deliver.ts";

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
  const targets = t.data as Targets;
  const out = await deliver(targets);
  await admin.rpc("push_report_all", { p_message: targets.message.id, p_targets: out.targets, p_delivered: out.delivered, p_gone: out.gone, p_gone_native: out.goneNative });
  return json({ ok: true, targets: out.targets, delivered: out.delivered });
});
