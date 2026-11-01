// The public events calendar as an iCalendar feed (RFC 5545): subscribe once from Google Calendar,
// Apple Calendar or Outlook and every new BuildX HUE event shows up by itself. Public data only
// (published events), read through public.calendar_events(). No sign-in: calendar apps can't send one.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type Ev = { id: string; slug: string; title: string; summary: string; location: string; starts_at: string; ends_at: string | null; updated_at: string };

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** Lines longer than 75 octets are folded (continuation lines start with a space). */
function fold(line: string) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("method", { status: 405 });
  const lang = new URL(req.url).searchParams.get("lang") === "en" ? "en" : "ar";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("calendar_events", { p_lang: lang });
  if (error) return new Response("unavailable", { status: 503 });
  const site = "https://buildxhue.com";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BuildX HUE//Events//AR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${lang === "en" ? "BuildX HUE events" : "فعاليات BuildX HUE"}`,
    "X-WR-TIMEZONE:Africa/Cairo",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  for (const e of (data ?? []) as Ev[]) {
    const end = e.ends_at ?? new Date(new Date(e.starts_at).getTime() + 2 * 3600_000).toISOString();
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@buildxhue.com`,
      `DTSTAMP:${stamp(e.updated_at)}`,
      `LAST-MODIFIED:${stamp(e.updated_at)}`,
      `DTSTART:${stamp(e.starts_at)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${esc(e.title)}`,
      ...(e.summary ? [`DESCRIPTION:${esc(e.summary.slice(0, 1500))}\\n\\n${site}/${lang}/events/${e.slug}/`] : [`DESCRIPTION:${site}/${lang}/events/${e.slug}/`]),
      ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
      `URL:${site}/${lang}/events/${e.slug}/`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(e.title)}`,
      "TRIGGER:-PT2H",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="buildx-hue-events.ics"',
      "Cache-Control": "public, max-age=900",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
