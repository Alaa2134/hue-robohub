import { getEvent } from "@/server/queries/public";
import { SITE_URL } from "@/lib/seo";

function stamp(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** iCalendar download for a public event (RFC 5545). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[\w-]{1,120}$/.test(slug)) return new Response("Not found", { status: 404 });
  const e = await getEvent(slug);
  if (!e) return new Response("Not found", { status: 404 });
  const end = e.endsAt ?? new Date(new Date(e.startsAt).getTime() + 2 * 3600_000).toISOString();
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BuildX HUE//Events//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${e.id}@robohub`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(e.startsAt)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(e.title)}`,
    `DESCRIPTION:${esc(e.description.slice(0, 1500))}`,
    e.location ? `LOCATION:${esc(e.location)}` : "",
    `URL:${SITE_URL}/events/${slug}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.ics"`,
      "Cache-Control": "public, max-age=0, s-maxage=900",
    },
  });
}
