// Meta's WhatsApp webhook: the messages people send to the team's number (into the app's inbox) and
// whether our messages were delivered, read or failed. The address carries a long random key (?k=)
// that only the database and the owner's app screen know; the database checks it, so a request
// without it is refused. Meta's "verify this address" handshake answers only to the same key.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const MAX = 1_000_000;
const text = (body: string, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/plain" } });

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  if (req.method === "GET") {
    const token = url.searchParams.get("hub.verify_token") ?? "";
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    if (url.searchParams.get("hub.mode") !== "subscribe" || !challenge) return text("bad request", 400);
    const ok = await admin.rpc("wa_webhook_verify", { p_token: token });
    return ok.data === true ? text(challenge) : text("forbidden", 403);
  }
  if (req.method !== "POST") return text("method", 405);

  const raw = await req.text();
  if (raw.length > MAX) return text("too large", 413);
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return text("invalid", 400);
  }
  const out = await admin.rpc("wa_webhook_ingest", { p_key: url.searchParams.get("k") ?? "", p_payload: payload });
  if (out.error) return text("server", 500);
  if ((out.data as { ok?: boolean } | null)?.ok !== true) return text("forbidden", 403);
  return text("ok");
});
