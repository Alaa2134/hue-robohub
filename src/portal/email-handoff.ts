/**
 * "ابعت إيميل" from a list in the app (applications, the family list): the people go to the email
 * screen through this visit's storage and the screen opens with them ready.
 */
import { go } from "./ui";

export type EmailPerson = { email: string; name: string };
export type EmailHandoff = {
  people: EmailPerson[];
  label: string;
  context: string | null;
  subject?: string;
  text?: string;
};
const KEY = "bx-email-handoff";

export function sendByEmail(
  people: { email?: string | null; name?: string | null }[],
  o: { label: string; context?: string | null; subject?: string; text?: string },
) {
  const list = people.filter((p) => p.email).map((p) => ({ email: p.email!, name: p.name ?? "" }));
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({
        people: list,
        label: o.label,
        context: o.context ?? null,
        subject: o.subject,
        text: o.text,
      } satisfies EmailHandoff),
    );
  } catch {}
  go("/staff/email");
}

/** The list handed over (read once). */
export function takeEmailHandoff(): EmailHandoff | null {
  try {
    const h = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as EmailHandoff | null;
    sessionStorage.removeItem(KEY);
    return h && Array.isArray(h.people) ? h : null;
  } catch {
    return null;
  }
}
