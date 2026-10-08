/**
 * Talking with Baqloz. Every question goes to his own brain (brain.ts), which answers from the
 * site's knowledge and supplies the links and follow-up suggestions. The AI (the bakloz-chat Edge
 * Function; its key and model are Supabase secrets, never in the page) writes the answer text
 * instead, with the conversation so far; if it isn't set up, is busy or slow, the brain's own answer
 * is used. NEXT_PUBLIC_MASCOT_GUIDE_URL points it elsewhere, or "off" turns it off.
 */
import { SUPABASE_URL } from "@/lib/supabase-public";
import { think, type BrainReply, type Memory } from "./brain";
import { fetchLive } from "./live";

export type ChatMsg = { id: number; role: "user" | "bot"; text: string; reply?: Omit<BrainReply, "text">; ai?: boolean };

const MEM_KEY = "bx-guide-mem";
const OFF_KEY = "bx-guide-ai-off";

function load(): Memory {
  try {
    return { turns: 0, ...(JSON.parse(sessionStorage.getItem(MEM_KEY) ?? "{}") as Partial<Memory>) };
  } catch {
    return { turns: 0 };
  }
}
function save(m: Memory) {
  try {
    sessionStorage.setItem(MEM_KEY, JSON.stringify(m));
  } catch {
    // Private mode: he forgets at the end of the page.
  }
}

async function ai(url: string, question: string, history: ChatMsg[], path: string): Promise<string | null> {
  try {
    if (sessionStorage.getItem(OFF_KEY)) return null;
  } catch {}
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: question.slice(0, 400), path, history: history.slice(-8).map((m) => ({ role: m.role, text: m.text.slice(0, 600) })) }),
      signal: ctl.signal,
    });
    const body = (await res.json().catch(() => ({}))) as { text?: string; disabled?: boolean };
    // Not set up on the server: don't ask again this visit.
    if (body.disabled) sessionStorage.setItem(OFF_KEY, "1");
    return res.ok && typeof body.text === "string" && body.text.trim() ? body.text.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function ask(question: string, history: ChatMsg[], path: string): Promise<BrainReply & { ai: boolean }> {
  const mem = load();
  const live = await fetchLive();
  const local = think(question, mem, path, live);
  mem.turns++;
  if (local.topic) mem.topic = local.topic;
  save(mem);
  const setting = process.env.NEXT_PUBLIC_MASCOT_GUIDE_URL;
  const url = setting === "off" ? null : setting || `${SUPABASE_URL}/functions/v1/bakloz-chat`;
  // Taking the tour or switching language is his own job; questions go to the AI.
  const own = local.action === "tour" || local.action === "pagetour" || local.action === "lang" || local.action === "top";
  const text = url && !own ? await ai(url, question, history, path) : null;
  if (!text) return { ...local, ai: false };
  // "I don't know, try search" no longer applies once the AI has answered.
  return local.action === "search" ? { ...local, action: undefined, label: undefined, text, ai: true } : { ...local, text, ai: true };
}

/** The visitor's name, if they told him. */
export const rememberedName = () => load().name;
