"use client";
/** Live website content (published from the BuildX App), read straight from Supabase in the browser. */
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/components/brand/icons";
import { trackName } from "@/components/team/team-directory";
import { cn } from "@/lib/cn";
import { bodyOf, fetchContent, fetchItem, fetchUpcoming, fmtDate, locationOf, resultOf, safeLink, siteImageUrl, summaryOf, titleOf, type ContentKind, type SiteItem } from "@/lib/site-content";

const T = {
  en: { upcoming: "Upcoming events", past: "Past events", noUpcoming: "No upcoming events are announced yet — follow the plan below.", register: "Register", details: "Details", read: "Read more", open: "Open", back: "Back", empty: "Nothing published here yet — check back soon.", missing: "We couldn't find this page.", error: "We couldn't load this right now. Check your connection and try again.", latest: "Latest from BuildX HUE", news: "News", photos: "photos", close: "Close", prev: "Previous", next: "Next" },
  ar: { upcoming: "الفعاليات الجاية", past: "فعاليات فاتت", noUpcoming: "لسه مفيش فعاليات معلنة — تابع الخطة اللي تحت.", register: "سجّل", details: "التفاصيل", read: "اقرا أكتر", open: "افتح", back: "رجوع", empty: "لسه مفيش حاجة منشورة هنا — ارجع قريب.", missing: "مش لاقيين الصفحة دي.", error: "مقدرناش نحمّل المحتوى. اتأكد من النت وجرّب تاني.", latest: "الجديد في BuildX HUE", news: "الأخبار", photos: "صورة", close: "إغلاق", prev: "السابق", next: "التالي" },
};
const tr = (l: string) => T[l === "ar" ? "ar" : "en"];

function useLive<R>(load: () => Promise<R>, deps: unknown[] = []) {
  const [s, setS] = useState<{ data?: R; failed?: boolean }>({});
  useEffect(() => {
    let alive = true;
    load()
      .then((data) => alive && setS({ data }))
      .catch(() => alive && setS({ failed: true }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return s;
}

const Skeleton = ({ n = 3, tall }: { n?: number; tall?: boolean }) => (
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
    {Array.from({ length: n }, (_, i) => (
      <div key={i} className={cn("animate-pulse rounded-[20px] bg-panel/60", tall ? "h-80" : "h-56")} />
    ))}
  </div>
);
const Note = ({ children }: { children: ReactNode }) => <p className="rounded-[18px] border border-[var(--line-2)] bg-panel/50 p-6 text-center text-mist">{children}</p>;

function Cover({ item, className }: { item: SiteItem; className?: string }) {
  return item.image_path ? <img src={siteImageUrl(item.image_path)} alt="" loading="lazy" className={cn("w-full object-cover", className)} /> : null;
}

/* ─── Events ───────────────────────────────────────────────────────────── */

function EventCard({ e, locale, past }: { e: SiteItem; locale: string; past?: boolean }) {
  const t = tr(locale);
  const link = safeLink(e.url);
  const where = locationOf(e, locale);
  return (
    <li className={cn("flex flex-col overflow-hidden rounded-[20px] border border-[var(--line-2)] bg-panel/70 sm:flex-row", past && "opacity-80")}>
      {e.image_path && <Cover item={e} className="aspect-video sm:aspect-auto sm:w-64" />}
      <div className="flex flex-1 flex-col gap-2 p-5 sm:p-6">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-cyan">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="calendar" size={16} />
            {fmtDate(e.starts_at, locale, true)}
          </span>
          {where && (
            <span className="inline-flex items-center gap-1.5 text-mist">
              <Icon name="pin" size={16} />
              {where}
            </span>
          )}
        </p>
        <h3 className="t-title text-xl text-chalk">{titleOf(e, locale)}</h3>
        {summaryOf(e, locale) && <p className="text-[0.97rem] leading-relaxed text-mist">{summaryOf(e, locale)}</p>}
        {bodyOf(e, locale) && <p className="whitespace-pre-line text-sm leading-relaxed text-fog">{bodyOf(e, locale)}</p>}
        {link && !past && (
          <a href={link} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm mt-2 w-fit">
            <span>{t.register}</span>
            <Icon name="arrowUpRight" size={14} />
          </a>
        )}
      </div>
    </li>
  );
}

export function LiveEvents({ locale }: { locale: string }) {
  const t = tr(locale);
  const s = useLive(() => fetchContent("event", 200));
  if (s.failed) return <Note>{t.error}</Note>;
  if (!s.data) return <Skeleton n={2} />;
  const cut = Date.now() - 6 * 3600_000;
  const when = (e: SiteItem) => new Date(e.ends_at ?? e.starts_at ?? 0).getTime();
  const upcoming = s.data.filter((e) => when(e) >= cut);
  const past = s.data.filter((e) => when(e) < cut).reverse();
  return (
    <div className="flex flex-col gap-12">
      <section>
        <h2 className="t-headline mb-5 text-2xl text-chalk">{t.upcoming}</h2>
        {upcoming.length ? (
          <ul className="grid gap-4">
            {upcoming.map((e) => (
              <EventCard key={e.id} e={e} locale={locale} />
            ))}
          </ul>
        ) : (
          <Note>{t.noUpcoming}</Note>
        )}
      </section>
      {past.length > 0 && (
        <section>
          <h2 className="t-headline mb-5 text-2xl text-chalk">{t.past}</h2>
          <ul className="grid gap-4">
            {past.slice(0, 20).map((e) => (
              <EventCard key={e.id} e={e} locale={locale} past />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ─── News & projects (list + detail) ──────────────────────────────────── */

function ItemCard({ item, locale, href }: { item: SiteItem; locale: string; href: string }) {
  const t = tr(locale);
  const track = trackName(item.track, locale);
  return (
    <li>
      <Link href={`${href}?s=${encodeURIComponent(item.slug ?? "")}`} className="group flex h-full flex-col overflow-hidden rounded-[20px] border border-[var(--line-2)] bg-panel/70 transition-[transform,border-color] duration-300 hover:-translate-y-1 hover:border-cyan/50">
        {item.image_path ? <Cover item={item} className="aspect-video" /> : <span className="aspect-video bg-gradient-to-br from-volt/40 via-volt-lo/30 to-cyan/20" />}
        <div className="flex flex-1 flex-col gap-2 p-5">
          <p className="flex flex-wrap items-center gap-2 text-sm text-fog">
            {item.pinned && <Icon name="award" size={14} className="text-gold" />}
            {item.kind === "post" ? fmtDate(item.created_at, locale) : track}
          </p>
          <h3 className="t-title text-xl text-chalk">{titleOf(item, locale)}</h3>
          {resultOf(item, locale) && <p className="w-fit rounded-full bg-gold/15 px-3 py-0.5 text-sm font-semibold text-gold">{resultOf(item, locale)}</p>}
          {summaryOf(item, locale) && <p className="line-clamp-3 text-[0.97rem] leading-relaxed text-mist">{summaryOf(item, locale)}</p>}
          <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-semibold text-cyan">
            {t.read}
            <Icon name="arrow" size={15} className="rtl:-scale-x-100" />
          </span>
        </div>
      </Link>
    </li>
  );
}

export function LiveList({ kind, locale, href }: { kind: "post" | "project"; locale: string; href: string }) {
  const t = tr(locale);
  const s = useLive(() => fetchContent(kind, 200), [kind]);
  if (s.failed) return <Note>{t.error}</Note>;
  if (!s.data) return <Skeleton tall />;
  if (!s.data.length) return <Note>{t.empty}</Note>;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {s.data.map((i) => (
        <ItemCard key={i.id} item={i} locale={locale} href={href} />
      ))}
    </ul>
  );
}

export function LiveDetail({ kind, locale, backHref }: { kind: "post" | "project"; locale: string; backHref: string }) {
  const t = tr(locale);
  const [slug, setSlug] = useState<string | null>(null);
  useEffect(() => setSlug(new URLSearchParams(window.location.search).get("s") ?? ""), []);
  const s = useLive(async () => (slug === null ? undefined : fetchItem(kind, slug)), [kind, slug]);
  useEffect(() => {
    if (s.data) document.title = `${titleOf(s.data, locale)} — BuildX HUE`;
  }, [s.data, locale]);
  const back = (
    <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-semibold text-cyan hover:underline">
      <Icon name="arrow" size={15} className="rotate-180 rtl:rotate-0" />
      {t.back}
    </Link>
  );
  if (s.failed) return <Note>{t.error}</Note>;
  if (slug === null || s.data === undefined) return <Skeleton n={1} tall />;
  if (!s.data)
    return (
      <div className="flex flex-col items-start gap-4">
        <Note>{t.missing}</Note>
        {back}
      </div>
    );
  const i = s.data;
  const link = safeLink(i.url);
  const track = trackName(i.track, locale);
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6">
      {back}
      <p className="flex flex-wrap items-center gap-3 text-sm text-fog">
        {kind === "post" ? fmtDate(i.created_at, locale) : track}
        {i.tags.length > 0 && <span>{i.tags.join(" · ")}</span>}
      </p>
      <h1 className="t-display text-[clamp(2rem,5vw,3.6rem)] text-chalk">{titleOf(i, locale)}</h1>
      {resultOf(i, locale) && <p className="w-fit rounded-full bg-gold/15 px-4 py-1 font-semibold text-gold">{resultOf(i, locale)}</p>}
      {summaryOf(i, locale) && <p className="text-xl leading-relaxed text-frost">{summaryOf(i, locale)}</p>}
      {i.image_path && <Cover item={i} className="rounded-[20px] border border-[var(--line-2)]" />}
      {bodyOf(i, locale) && <div className="whitespace-pre-line text-pretty text-lg leading-relaxed text-mist">{bodyOf(i, locale)}</div>}
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer nofollow" className="btn w-fit">
          <span>{t.open}</span>
          <Icon name="arrowUpRight" size={14} />
        </a>
      )}
    </article>
  );
}

/* ─── Gallery ──────────────────────────────────────────────────────────── */

export function LiveGallery({ locale }: { locale: string }) {
  const t = tr(locale);
  const s = useLive(() => fetchContent("photo", 500));
  const [album, setAlbum] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const photos = (s.data ?? []).filter((p) => p.image_path && (!album || p.tags.includes(album)));
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % photos.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, photos.length]);
  if (s.failed) return <Note>{t.error}</Note>;
  if (!s.data) return <Skeleton n={6} />;
  if (!s.data.length) return <Note>{t.empty}</Note>;
  const albums = [...new Set(s.data.flatMap((p) => p.tags))];
  const cur = open !== null ? photos[open] : null;
  return (
    <>
      {albums.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {["", ...albums].map((a) => (
            <button key={a || "all"} type="button" onClick={() => setAlbum(a)} aria-pressed={album === a} className={cn("rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors", album === a ? "border-cyan/60 bg-cyan/15 text-ice" : "border-[var(--line-2)] text-mist hover:text-chalk")}>
              {a || (locale === "ar" ? "الكل" : "All")}
            </button>
          ))}
        </div>
      )}
      <ul className="columns-2 gap-3 sm:columns-3 lg:columns-4">
        {photos.map((p, idx) => (
          <li key={p.id} className="mb-3 break-inside-avoid">
            <button type="button" onClick={() => setOpen(idx)} className="block w-full overflow-hidden rounded-2xl border border-[var(--line)] focus-visible:outline-2">
              <img src={siteImageUrl(p.image_path!)} alt={titleOf(p, locale)} loading="lazy" className="w-full transition-transform duration-500 hover:scale-[1.03]" />
            </button>
          </li>
        ))}
      </ul>
      {cur && (
        <div role="dialog" aria-modal="true" aria-label={titleOf(cur, locale) || t.photos} className="fixed inset-0 z-[90] flex flex-col bg-void/95 backdrop-blur" onClick={() => setOpen(null)}>
          <div className="flex items-center justify-between p-4 text-sm text-mist">
            <span>
              {open! + 1} / {photos.length}
            </span>
            <button type="button" className="btn btn-sm" onClick={() => setOpen(null)}>
              {t.close}
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center gap-2 px-2 pb-6" onClick={(e) => e.stopPropagation()}>
            <button type="button" aria-label={t.prev} className="btn btn-sm shrink-0" onClick={() => setOpen((i) => (i! - 1 + photos.length) % photos.length)}>
              <Icon name="chevron" size={18} className="rotate-180 rtl:rotate-0" />
            </button>
            <figure className="flex max-h-full min-w-0 flex-col items-center gap-3">
              <img src={siteImageUrl(cur.image_path!)} alt={titleOf(cur, locale)} className="max-h-[78vh] max-w-full rounded-xl object-contain" />
              {(titleOf(cur, locale) || cur.starts_at) && (
                <figcaption className="text-center text-sm text-mist">
                  {titleOf(cur, locale)} {cur.starts_at && <span className="text-fog">· {fmtDate(cur.starts_at, locale)}</span>}
                </figcaption>
              )}
            </figure>
            <button type="button" aria-label={t.next} className="btn btn-sm shrink-0" onClick={() => setOpen((i) => (i! + 1) % photos.length)}>
              <Icon name="chevron" size={18} className="rtl:rotate-180" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Achievements ─────────────────────────────────────────────────────── */

export function LiveAchievements({ locale }: { locale: string }) {
  const t = tr(locale);
  const s = useLive(() => fetchContent("achievement", 200));
  if (s.failed) return <Note>{t.error}</Note>;
  if (!s.data) return <Skeleton />;
  if (!s.data.length) return <Note>{t.empty}</Note>;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {s.data.map((a) => {
        const link = safeLink(a.url);
        return (
          <li key={a.id} className="flex flex-col overflow-hidden rounded-[20px] border border-gold/25 bg-panel/70">
            {a.image_path && <Cover item={a} className="aspect-video" />}
            <div className="flex flex-1 flex-col gap-2 p-5">
              <span className="flex items-center gap-2 text-gold">
                <Icon name="trophy" size={20} />
                <span className="font-semibold">{resultOf(a, locale)}</span>
              </span>
              <h3 className="t-title text-xl text-chalk">{titleOf(a, locale)}</h3>
              {a.starts_at && <p className="text-sm text-fog">{fmtDate(a.starts_at, locale)}</p>}
              {summaryOf(a, locale) && <p className="text-[0.97rem] leading-relaxed text-mist">{summaryOf(a, locale)}</p>}
              {link && (
                <a href={link} target="_blank" rel="noopener noreferrer nofollow" className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-semibold text-cyan hover:underline">
                  {t.open}
                  <Icon name="arrowUpRight" size={14} />
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ─── Home: what's new (hidden until there is something) ───────────────── */

export function LatestStrip({ locale, eventsHref, newsHref, postHref }: { locale: string; eventsHref: string; newsHref: string; postHref: string }) {
  const t = tr(locale);
  const s = useLive(async () => {
    const [events, posts] = await Promise.all([fetchUpcoming(2), fetchContent("post", 3)]);
    return { events, posts };
  });
  if (!s.data || (!s.data.events.length && !s.data.posts.length)) return null;
  return (
    <section aria-labelledby="latest-title" className="border-y border-[var(--line)] bg-abyss">
      <div className="mx-auto max-w-[1680px] px-5 py-16 sm:px-8 lg:py-20">
        <h2 id="latest-title" className="t-display mb-8 text-[clamp(1.8rem,4vw,3rem)] text-chalk">
          {t.latest}
        </h2>
        <div className="grid gap-8 lg:grid-cols-2">
          {s.data.events.length > 0 && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="t-headline text-xl text-chalk">{t.upcoming}</h3>
                <Link href={eventsHref} className="text-sm font-semibold text-cyan hover:underline">
                  {t.details}
                </Link>
              </div>
              <ul className="grid gap-3">
                {s.data.events.map((e) => (
                  <EventCard key={e.id} e={e} locale={locale} />
                ))}
              </ul>
            </div>
          )}
          {s.data.posts.length > 0 && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="t-headline text-xl text-chalk">{t.news}</h3>
                <Link href={newsHref} className="text-sm font-semibold text-cyan hover:underline">
                  {t.details}
                </Link>
              </div>
              <ul className="grid gap-3">
                {s.data.posts.map((p) => (
                  <li key={p.id}>
                    <Link href={`${postHref}?s=${encodeURIComponent(p.slug ?? "")}`} className="flex gap-4 rounded-[18px] border border-[var(--line-2)] bg-panel/70 p-4 transition-colors hover:border-cyan/50">
                      {p.image_path && <img src={siteImageUrl(p.image_path)} alt="" loading="lazy" className="size-20 shrink-0 rounded-xl object-cover" />}
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="text-sm text-fog">{fmtDate(p.created_at, locale)}</span>
                        <span className="t-title text-lg text-chalk">{titleOf(p, locale)}</span>
                        {summaryOf(p, locale) && <span className="line-clamp-2 text-sm text-mist">{summaryOf(p, locale)}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export type { ContentKind };
