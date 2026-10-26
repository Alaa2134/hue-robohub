// The Competition Coach's AI answer. It sees only the rule sections the database's search found for
// the question, must cite them by their number in [brackets], and every citation is checked against
// those sections: unknown numbers are removed, and an answer left with none isn't sent (the page
// shows the sections themselves instead). The rule text is never invented here.
//
// Secrets: ANTHROPIC_API_KEY, and COACH_MODEL (falls back to GUIDE_MODEL). Without them: {disabled}.
// Spending guard: off until the team turns it on (site_settings 'coach_ai'), then the guide's limits
// per visitor and per day apply (coach_ai_allow), answers are cached for a week per book version,
// and tokens are counted under "coach".
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk@0.132.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkCitations } from "../_shared/citations.ts";

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

type Passage = { ref: string; heading: string; body: string };

const RULES = `You answer questions about a robotics competition's official rules, for students preparing for it.
- Use ONLY the rule sections given below. Do not add rules, numbers, limits or advice that are not in them.
- After every statement, cite the section it comes from by its number in square brackets, exactly as given, e.g. [4.2].
- If the sections don't answer the question, say so plainly in one sentence and suggest asking the organisers. Don't guess.
- Answer in the language of the question (Egyptian Arabic if it's in Arabic). Short: one to five sentences, plain text, no Markdown.`;

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");
const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

async function sha(text: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const headers = { ...cors(req), "Content-Type": "application/json" };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return reply({ error: "method" }, 405);
  if (!ORIGINS.includes(req.headers.get("origin") ?? "")) return reply({ error: "origin" }, 403);

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  const model = Deno.env.get("COACH_MODEL") || Deno.env.get("GUIDE_MODEL");
  if (!key || !model) return reply({ disabled: true });

  let input: { book?: unknown; question?: unknown };
  try {
    input = await req.json();
  } catch {
    return reply({ error: "invalid" }, 400);
  }
  const book = clean(input.book, 50);
  const question = clean(input.question, 300);
  if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(book) || question.length < 3) return reply({ error: "invalid" }, 400);

  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const ctx = await admin.rpc("coach_ai_context", { p_book: book, p_q: question });
  if (ctx.error || !ctx.data?.book) return reply({ error: "book" }, 404);
  const passages = (ctx.data.passages ?? []) as Passage[];
  // Nothing in the rules matches: say so without spending anything.
  if (!passages.length) return reply({ answer: null, reason: "no_sections" });

  const ckey = await sha(`${book}\n${ctx.data.book.updated_at}\n${normalize(question)}`);
  const hit = await admin.rpc("coach_cache_get", { p_key: ckey });
  if (!hit.error && hit.data) return reply({ ...hit.data, cached: true });

  const allowed = await admin.rpc("coach_ai_allow", { p_ip: ip });
  if (allowed.error) return reply({ error: "unavailable" }, 503);
  if (allowed.data !== true) return reply({ error: "busy" }, 429);
  const me = await admin.rpc("guide_chat_who", { p_ip: ip });
  const who = !me.error && typeof me.data?.who === "string" ? (me.data.who as string) : "";

  const sections = passages.map((p) => `[${p.ref}] ${p.heading}\n${p.body}`).join("\n\n");
  try {
    const client = new Anthropic({ apiKey: key, timeout: 15000, maxRetries: 0 });
    const res = await client.messages.create({
      model,
      max_tokens: 600,
      system: RULES,
      messages: [{ role: "user", content: `Rule book: ${ctx.data.book.title} (${ctx.data.book.competition} ${ctx.data.book.edition})\n\nSections:\n${sections}\n\nQuestion: ${question}` }],
    });
    const u = res.usage;
    await admin.rpc("guide_usage_add", { p_in: u?.input_tokens ?? 0, p_out: u?.output_tokens ?? 0, p_cache_read: u?.cache_read_input_tokens ?? 0, p_cache_write: u?.cache_creation_input_tokens ?? 0, p_service: "coach", p_who: who });
    if (res.stop_reason === "refusal") return reply({ answer: null, reason: "refusal" });
    const raw = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").replace(/\*\*|__|^#+\s*/gm, "").trim();
    const checked = checkCitations(raw, passages.map((x) => x.ref));
    if (!checked) return reply({ answer: null, reason: "no_citation" });
    const out = { answer: checked.text, cited: checked.cited };
    if (res.stop_reason === "end_turn") await admin.rpc("coach_cache_put", { p_key: ckey, p_answer: out });
    return reply(out);
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : undefined;
    const kind = e instanceof Error ? e.name : "error";
    console.error("coach-ask", status ?? "", kind);
    await admin.rpc("ai_error_add", { p_service: "coach", p_status: status ?? null, p_kind: kind }).then(
      () => undefined,
      () => undefined,
    );
    return reply({ answer: null, error: "ai" }, 502);
  }
});
