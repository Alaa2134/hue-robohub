/**
 * "ابعت واتساب" from any list in the app (form responses, students, applications, follow-ups): the
 * people go to the WhatsApp screen through this visit's storage and the screen opens with them ready.
 * Each person can carry their own {link} {code} {pass} {ticket}, filled into the message for them.
 */
import { go } from "./ui";

export type WaVars = { link?: string; code?: string; pass?: string; ticket?: string };
export type HandoffPerson = { phone: string; name: string; vars?: WaVars };
export type Handoff = { people: HandoffPerson[]; label: string; context: string | null; text?: string };
const KEY = "bx-wa-handoff";

export function sendOnWhatsApp(people: { phone?: string | null; name?: string | null; vars?: WaVars }[], o: { label: string; context?: string | null; text?: string }) {
  const list = people.filter((p) => p.phone).map((p) => ({ phone: p.phone!, name: p.name ?? "", ...(p.vars ? { vars: p.vars } : {}) }));
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ people: list, label: o.label, context: o.context ?? null, text: o.text } satisfies Handoff));
  } catch {}
  go("/staff/whatsapp");
}

/** The list handed over (read once). */
export function takeHandoff(): Handoff | null {
  try {
    const h = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Handoff | null;
    sessionStorage.removeItem(KEY);
    return h && Array.isArray(h.people) ? h : null;
  } catch {
    return null;
  }
}

const VAR_KEYS = ["link", "code", "pass", "ticket"] as const;
/** {link} {code} {pass} {ticket} → this person's values (same as the database's wa_fill_vars). */
export const fillVars = (text: string, vars?: WaVars) => VAR_KEYS.reduce((t, k) => t.replaceAll(`{${k}}`, vars?.[k] ?? ""), text);
/** The text asks for one of them that this person does not have (same as the database's wa_vars_missing). */
export const missingVar = (text: string, vars?: WaVars) => VAR_KEYS.some((k) => text.includes(`{${k}}`) && !vars?.[k]?.trim());
/** Which of them the people carry (to show as hints). */
export const varsOf = (people: HandoffPerson[]) => VAR_KEYS.filter((k) => people.some((p) => p.vars?.[k]));
