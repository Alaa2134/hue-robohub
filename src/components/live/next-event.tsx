"use client";
/** Home page: the next event with a live countdown, places left, register and add-to-calendar. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/brand/icons";
import { fetchUpcoming, fmtDate, locationOf, summaryOf, titleOf, type SiteItem } from "@/lib/site-content";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

const T = {
  ar: { kicker: "الإيفنت الجاي", live: "شغّال دلوقتي!", d: "يوم", h: "ساعة", m: "دقيقة", s: "ثانية", register: "سجّل مكانك", details: "التفاصيل", calendar: "ضيفه لتقويمك", google: "Google Calendar", left: (n: number) => (n === 1 ? "فاضل مكان واحد!" : n <= 10 ? `فاضل ${n} أماكن بس!` : `فاضل ${n} مكان`), full: "الأماكن خلصت (في قايمة انتظار)" },
  en: { kicker: "Next event", live: "Happening now!", d: "days", h: "hours", m: "min", s: "sec", register: "Save your seat", details: "Details", calendar: "Add to calendar", google: "Google Calendar", left: (n: number) => (n === 1 ? "Only 1 seat left!" : `${n} seats left`), full: "Fully booked (waiting list open)" },
};

const ics = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");

function calendarFile(e: SiteItem, locale: string, url: string) {
  const start = new Date(e.starts_at!);
  const end = e.ends_at ? new Date(e.ends_at) : new Date(start.getTime() + 2 * 3600_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BuildX HUE//Events//AR",
    "BEGIN:VEVENT",
    `UID:${e.id}@buildxhue.com`,
    `DTSTAMP:${ics(new Date())}`,
    `DTSTART:${ics(start)}`,
    `DTEND:${ics(end)}`,
    `SUMMARY:${esc(titleOf(e, locale))}`,
    `DESCRIPTION:${esc(`${summaryOf(e, locale) ?? ""}\n${url}`.trim())}`,
    ...(locationOf(e, locale) ? [`LOCATION:${esc(locationOf(e, locale)!)}`] : []),
    `URL:${url}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(titleOf(e, locale))}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
}

function googleLink(e: SiteItem, locale: string, url: string) {
  const start = new Date(e.starts_at!);
  const end = e.ends_at ? new Date(e.ends_at) : new Date(start.getTime() + 2 * 3600_000);
  const q = new URLSearchParams({ action: "TEMPLATE", text: titleOf(e, locale), dates: `${ics(start)}/${ics(end)}`, details: url, location: locationOf(e, locale) ?? "" });
  return `https://calendar.google.com/calendar/render?${q}`;
}

export function NextEvent({ locale, eventsHref }: { locale: string; eventsHref: string }) {
  const t = T[locale === "ar" ? "ar" : "en"];
  const [e, setE] = useState<SiteItem | null>(null);
  const [seats, setSeats] = useState<{ open: boolean; capacity: number | null; going: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    fetchUpcoming(3)
      .then((list) => {
        const next = list.find((x) => x.starts_at && new Date(x.ends_at ?? new Date(new Date(x.starts_at).getTime() + 3 * 3600_000)).getTime() > Date.now());
        if (!alive || !next) return;
        setE(next);
        return fetch(`${SUPABASE_URL}/rest/v1/rpc/event_rsvp`, { method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ p_event: next.id }) })
          .then((r) => (r.ok ? r.json() : null))
          .then((s) => alive && s && setSeats(s));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!e) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [e]);

  if (!e?.starts_at) return null;
  const start = new Date(e.starts_at).getTime();
  const left = Math.max(0, start - now);
  const live = left === 0;
  const parts = [
    [Math.floor(left / 86_400_000), t.d],
    [Math.floor(left / 3_600_000) % 24, t.h],
    [Math.floor(left / 60_000) % 60, t.m],
    [Math.floor(left / 1000) % 60, t.s],
  ] as const;
  const page = e.slug ? `${eventsHref}${encodeURIComponent(e.slug)}/` : eventsHref;
  const abs = typeof location === "undefined" ? page : new URL(page, location.href).href;
  const free = seats?.capacity ? Math.max(0, seats.capacity - seats.going) : null;
  const where = locationOf(e, locale);

  return (
    <section aria-labelledby="next-event-title" className="relative overflow-hidden border-b border-[var(--line)] bg-gradient-to-b from-[#0b1d4a]/70 to-transparent">
      <div className="mx-auto grid max-w-[1680px] items-center gap-8 px-5 py-12 sm:px-8 lg:grid-cols-[1.2fr_1fr] lg:py-16">
        <div className="flex flex-col gap-3">
          <p className="t-eyebrow flex items-center gap-2 text-cyan">
            <span className="size-2 animate-pulse rounded-full bg-cyan" />
            {live ? t.live : t.kicker}
          </p>
          <h2 id="next-event-title" className="t-headline text-[clamp(1.7rem,3.6vw,2.8rem)] text-chalk">
            {titleOf(e, locale)}
          </h2>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-mist">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="calendar" size={16} />
              {fmtDate(e.starts_at, locale, true)}
            </span>
            {where && (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="pin" size={16} />
                {where}
              </span>
            )}
          </p>
          {seats?.open && free !== null && <p className={`text-sm font-semibold ${free === 0 ? "text-warn" : free <= 10 ? "text-[#ffb15c]" : "text-ok"}`}>{free === 0 ? t.full : t.left(free)}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href={page} className="btn btn-primary">
              <span aria-hidden className="btn-sheen" />
              <span>{seats?.open ? t.register : t.details}</span>
              <Icon name="arrow" size={15} className="btn-arrow" />
            </Link>
            {!live && (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(calendarFile(e, locale, abs));
                    a.download = `${e.slug ?? "buildx-event"}.ics`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
                  }}
                >
                  <Icon name="calendar" size={15} />
                  <span>{t.calendar}</span>
                </button>
                <a href={googleLink(e, locale, abs)} target="_blank" rel="noopener noreferrer" className="btn">
                  <span>{t.google}</span>
                  <Icon name="arrowUpRight" size={14} />
                </a>
              </>
            )}
          </div>
        </div>
        {!live && (
          <div role="timer" aria-live="off" aria-label={`${parts.map(([n, u]) => `${n} ${u}`).join(" ")}`} className="grid grid-cols-4 gap-2 sm:gap-3" dir="ltr">
            {parts.map(([n, u]) => (
              <div key={u} className="flex flex-col items-center rounded-2xl border border-[var(--line-2)] bg-panel/60 py-4 backdrop-blur">
                <span className="t-display text-[clamp(1.8rem,5vw,3.4rem)] tabular-nums text-chalk">{String(n).padStart(2, "0")}</span>
                <span className="text-xs text-fog" lang={locale}>
                  {u}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
