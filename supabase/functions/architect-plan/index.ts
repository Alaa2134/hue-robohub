// The Project Architect's AI plan: from a student's idea, a parts list chosen ONLY from the Lab's
// catalog (sent by the Lab, checked here), what each part is for, the connections to make, and the
// steps. It never gives prices or availability — those come from the database's dated sources and
// the BuildX store — and the connections are a checklist the student wires in the Lab, where the
// circuit check reviews them before anything runs.
//
// Secrets: ANTHROPIC_API_KEY, and ARCHITECT_MODEL (falls back to GUIDE_MODEL). Without them: {disabled}.
// Off until the team turns it on (site_settings 'architect_ai'); the guide's limits and daily cap
// apply; tokens are counted under "architect".
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk@0.132.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGINS = ["https://buildxhue.com", "https://www.buildxhue.com", "http://localhost:4173", "http://localhost:3000", "https://localhost", "capacitor://localhost"];

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

const RULES = `You plan beginner Arduino projects for university students in Egypt, using ONLY parts from the catalog given (by their exact type id).
Reply with one JSON object and nothing else:
{"title": string, "summary": string (2 sentences), "parts": [{"type": catalog id, "qty": integer 1-20, "why": string}],
 "connections": [string, e.g. "LED long leg → D9 through the 220 Ω resistor"], "steps": [string], "code": string (short Arduino sketch outline, comments allowed)}
Rules: always include one Arduino board from the catalog; add resistors where LEDs need them; keep it buildable in a week; no prices, shops or availability;
if the idea needs something not in the catalog, use the closest catalog part and say so in "why". Write the strings in the language of the idea (Egyptian Arabic if Arabic).`;

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");

type Plan = { title: string; summary: string; parts: { type: string; qty: number; why: string }[]; connections: string[]; steps: string[]; code: string };

/** Keep only what fits the shape, and only parts that are in the catalog. */
function checkPlan(raw: string, catalog: Set<string>): Plan | null {
  const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(json);
  } catch {
    return null;
  }
  const list = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => clean(x, max)).filter(Boolean).slice(0, n) : []);
  const parts = (Array.isArray(p.parts) ? p.parts : [])
    .map((x) => x as Record<string, unknown>)
    .filter((x) => typeof x.type === "string" && catalog.has(x.type))
    .map((x) => ({ type: x.type as string, qty: Math.max(1, Math.min(20, Math.round(Number(x.qty) || 1))), why: clean(x.why, 200) }))
    .slice(0, 25);
  if (!parts.length) return null;
  return {
    title: clean(p.title, 100),
    summary: clean(p.summary, 400),
    parts,
    connections: list(p.connections, 40, 200),
    steps: list(p.steps, 15, 300),
    code: typeof p.code === "string" ? p.code.slice(0, 4000) : "",
  };
}

Deno.serve(async (req) => {
  const headers = { ...cors(req), "Content-Type": "application/json" };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return reply({ error: "method" }, 405);
  if (!ORIGINS.includes(req.headers.get("origin") ?? "")) return reply({ error: "origin" }, 403);

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  const model = Deno.env.get("ARCHITECT_MODEL") || Deno.env.get("GUIDE_MODEL");
  if (!key || !model) return reply({ disabled: true });

  let input: { idea?: unknown; catalog?: unknown };
  try {
    input = await req.json();
  } catch {
    return reply({ error: "invalid" }, 400);
  }
  const idea = clean(input.idea, 600);
  const catalog = (Array.isArray(input.catalog) ? input.catalog : [])
    .filter((c): c is { type: string; name: string } => !!c && typeof c === "object" && typeof (c as { type: unknown }).type === "string")
    .filter((c) => /^[a-z0-9-]{2,40}$/.test(c.type))
    .slice(0, 150)
    .map((c) => ({ type: c.type, name: clean(c.name, 60) }));
  if (idea.length < 10 || catalog.length < 3) return reply({ error: "invalid" }, 400);

  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const allowed = await admin.rpc("architect_ai_allow", { p_ip: ip });
  if (allowed.error) return reply({ error: "unavailable" }, 503);
  if (allowed.data !== true) return reply({ error: "busy" }, 429);
  const me = await admin.rpc("guide_chat_who", { p_ip: ip });
  const who = !me.error && typeof me.data?.who === "string" ? (me.data.who as string) : "";

  try {
    const client = new Anthropic({ apiKey: key, timeout: 25000, maxRetries: 0 });
    const res = await client.messages.create({
      model,
      max_tokens: 1800,
      system: [{ type: "text", text: `${RULES}\n\nCatalog (type id — name):\n${catalog.map((c) => `${c.type} — ${c.name}`).join("\n")}`, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Idea: ${idea}` }],
    });
    const u = res.usage;
    await admin.rpc("guide_usage_add", { p_in: u?.input_tokens ?? 0, p_out: u?.output_tokens ?? 0, p_cache_read: u?.cache_read_input_tokens ?? 0, p_cache_write: u?.cache_creation_input_tokens ?? 0, p_service: "architect", p_who: who });
    if (res.stop_reason === "refusal") return reply({ plan: null, reason: "refusal" });
    const plan = checkPlan(res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(""), new Set(catalog.map((c) => c.type)));
    return reply(plan ? { plan } : { plan: null, reason: "shape" });
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : undefined;
    const kind = e instanceof Error ? e.name : "error";
    console.error("architect-plan", status ?? "", kind);
    await admin.rpc("ai_error_add", { p_service: "architect", p_status: status ?? null, p_kind: kind }).then(
      () => undefined,
      () => undefined,
    );
    return reply({ plan: null, error: "ai" }, 502);
  }
});
