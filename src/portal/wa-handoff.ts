/**
 * "ابعت واتساب" from any list in the app (form responses, students, applications, follow-ups): the
 * people go to the WhatsApp screen through this visit's storage and the screen opens with them ready.
 */
import { go } from "./ui";

export type HandoffPerson = { phone: string; name: string };
export type Handoff = { people: HandoffPerson[]; label: string; context: string | null; text?: string };
const KEY = "bx-wa-handoff";

export function sendOnWhatsApp(people: { phone?: string | null; name?: string | null }[], o: { label: string; context?: string | null; text?: string }) {
  const list = people.filter((p) => p.phone).map((p) => ({ phone: p.phone!, name: p.name ?? "" }));
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
