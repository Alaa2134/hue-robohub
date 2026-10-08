/**
 * What's happening right now, for Baqloz: the next events (with places left), the latest news, the
 * open forms and whether applications are open (public.guide_live_context). Read once and kept for
 * two minutes in this visit; nothing personal.
 */
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

export type LiveEvent = { slug: string | null; title: string; starts_at: string; ends_at: string | null; location: string | null; rsvp_open: boolean; capacity: number | null; going: number };
export type Live = {
  now: string;
  applications_open: boolean;
  events: LiveEvent[];
  news: { slug: string | null; title: string; at: string }[];
  forms: { slug: string; title: string; team: string | null; closes_at: string | null }[];
};

const KEY = "bx-guide-live";
let pending: Promise<Live | null> | null = null;

export function fetchLive(): Promise<Live | null> {
  try {
    const c = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { at: number; live: Live } | null;
    if (c && Date.now() - c.at < 120_000) return Promise.resolve(c.live);
  } catch {}
  pending ??= fetch(`${SUPABASE_URL}/rest/v1/rpc/guide_live_context`, { method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(4000) })
    .then((r) => (r.ok ? (r.json() as Promise<Live>) : null))
    .then((live) => {
      if (live)
        try {
          sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), live }));
        } catch {}
      return live;
    })
    .catch(() => null)
    .finally(() => (pending = null));
  return pending;
}

const day = (iso: string) => new Intl.DateTimeFormat("ar-EG", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** "فاضل 5 أماكن" / "الأماكن خلصت" / "" for an event. */
export function placesLeft(e: LiveEvent): string {
  if (!e.rsvp_open) return "";
  if (!e.capacity) return "والتسجيل مفتوح";
  const free = Math.max(0, e.capacity - e.going);
  return free === 0 ? "والأماكن خلصت، بس فيه قايمة انتظار" : free === 1 ? "وفاضل مكان واحد بس!" : free <= 10 ? `وفاضل ${free} أماكن بس!` : `وفاضل ${free} مكان`;
}

export function eventLine(e: LiveEvent): string {
  return `«${e.title}» ${day(e.starts_at)}${e.location ? ` في ${e.location}` : ""}${placesLeft(e) ? `، ${placesLeft(e)}` : ""}`;
}
