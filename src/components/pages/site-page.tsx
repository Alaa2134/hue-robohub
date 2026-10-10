"use client";
/**
 * Draws a page built from blocks in the BuildX App (src/lib/site-pages.ts): the header with its
 * photo, countdown and facts, a quick menu to its parts, then each block in order on alternating
 * bands, and on phones the "apply" bar. LiveSitePage shows the built-in version first (if any)
 * and switches to the team's saved one as soon as it arrives.
 */
import { startTransition, useEffect, useState } from "react";
import { ICON_NAMES, Icon, type IconName } from "@/components/brand/icons";
import { DelegationCounter, ExpoApplyBar, ExpoCountdown } from "@/components/forms/expo-live";
import { FormFiller, FormStatus } from "@/components/forms/site-forms";
import { LiveGallery } from "@/components/live/live-content";
import { Picture } from "@/components/media/picture";
import { MediaWallGrid, type WallImage } from "@/components/pages/lightbox";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { SectionHead } from "@/components/ui/section-head";
import { cn } from "@/lib/cn";
import { BASE_PATH } from "@/lib/deploy";
import { cleanPage, imageOf, tx, type Block, type Btn, type HeroBlock, type SitePage } from "@/lib/site-pages";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

const L = {
  ar: {
    going: "في الوفد لحد دلوقتي",
    left: "فاضل {n} مكان",
    full: "الوفد كامل",
    closed: "العدد هيظهر هنا أول ما القبول يبدأ.",
    days: { zero: "النهارده!", one: "فاضل يوم واحد", two: "فاضل يومين", few: "فاضل {n} أيام", many: "فاضل {n} يوم" },
    lightbox: { close: "قفل", prev: "اللي قبلها", next: "اللي بعدها" },
    album: "ألبوم الصور",
    albumEmpty: "الصور هتنزل هنا بعد الفعالية 📸",
    apply: "قدّم",
    missing: "الصفحة دي مش موجودة أو لسه متنشرتش.",
    home: "الرئيسية",
  },
  en: {
    going: "in the delegation so far",
    left: "{n} places left",
    full: "The delegation is full",
    closed: "The count shows here once acceptances start.",
    days: { zero: "Today!", one: "1 day to go", two: "2 days to go", few: "{n} days to go", many: "{n} days to go" },
    lightbox: { close: "Close", prev: "Previous", next: "Next" },
    album: "Photo album",
    albumEmpty: "Photos go up here after the event 📸",
    apply: "Apply",
    missing: "This page doesn't exist or isn't published yet.",
    home: "Home",
  },
};

const iconOf = (n: string | undefined): IconName => (n && (ICON_NAMES as string[]).includes(n) ? (n as IconName) : "bolt");
const anchorOf = (b: Block) => b.anchor?.trim() || `b-${b.id}`;
/** A link from a saved page: only a part of the page, a path on the site, https, mail or phone (never javascript: and friends). */
const asset = (href: string) => {
  const h = (href ?? "").trim();
  if (h.startsWith("#")) return h;
  if (h.startsWith("/") && !h.startsWith("//") && !h.startsWith("/\\")) return `${BASE_PATH}${h}`;
  return /^(https?:\/\/|mailto:|tel:)/i.test(h) ? h : "#";
};

function Buttons({ buttons, locale, className }: { buttons: Btn[]; locale: string; className?: string }) {
  if (!buttons.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      {buttons.map((b, i) => {
        const external = /^https?:\/\//.test(b.href);
        return (
          <a key={i} href={asset(b.href)} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className={cn("btn btn-lg", b.primary && "btn-primary")}>
            {b.primary && <span aria-hidden className="btn-sheen" />}
            <span>{tx(b.label, locale)}</span>
          </a>
        );
      })}
    </div>
  );
}

function Hero({ b, locale, accent, crumbs }: { b: HeroBlock; locale: string; accent: string; crumbs?: { label: string; href?: string }[] }) {
  const c = b.countdown;
  return (
    <PageHero
      eyebrow={tx(b.eyebrow, locale)}
      title={tx(b.title, locale)}
      body={tx(b.body, locale) || undefined}
      image={imageOf(b.image, locale)}
      accent={accent}
      crumbs={crumbs}
      actions={<Buttons buttons={b.buttons} locale={locale} />}
    >
      {c && Date.parse(c.start) > 0 && (
        <ExpoCountdown
          start={Date.parse(c.start)}
          end={Date.parse(c.end) || Date.parse(c.start) + 864e5}
          labels={{ title: tx(c.title, locale), live: tx(c.live, locale), over: tx(c.over, locale), ...(locale === "en" ? { d: "days", h: "hours", m: "min", s: "sec" } : { d: "يوم", h: "ساعة", m: "دقيقة", s: "ثانية" }) }}
        />
      )}
      {!!b.facts.length && (
        <dl className="enter mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)] lg:grid-cols-4" style={{ ["--d" as string]: "800ms" }}>
          {b.facts.map((f, i) => (
            <div key={i} className="bg-void/70 px-4 py-3 backdrop-blur sm:px-5 sm:py-4">
              <dt className="t-eyebrow text-[0.58rem] text-fog">{tx(f.d, locale)}</dt>
              <dd className="t-headline mt-1.5 text-lg text-chalk sm:text-xl">
                {tx(f.k, locale)} <span className="text-sm font-normal text-mist sm:text-base">{tx(f.t, locale)}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </PageHero>
  );
}

const head = "mt-8 sm:mt-12";

function Section({ b, i, locale, accent, slug }: { b: Block; i: number; locale: string; accent: string; slug: string }) {
  const l = L[locale === "en" ? "en" : "ar"];
  const title = tx(b.title, locale);
  const header = title ? <SectionHead index={String(i).padStart(2, "0")} eyebrow={tx(b.eyebrow, locale)} title={title} body={b.type === "text" ? undefined : tx(b.body, locale) || undefined} size="md" accent={accent} /> : null;
  switch (b.type) {
    case "text":
      return (
        <>
          {header}
          {tx(b.body, locale) && <p className={cn(head, "max-w-3xl whitespace-pre-line text-lg leading-relaxed text-mist")}>{tx(b.body, locale)}</p>}
        </>
      );
    case "cards": {
      const swipe = b.layout === "swipe";
      return (
        <>
          {header}
          <ul
            data-testid="page-cards"
            className={cn(
              head,
              swipe
                ? "-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-3 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-3"
                : cn("grid gap-3 sm:gap-4", b.layout === "two" ? "md:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3"),
            )}
          >
            {b.items.map((x, k) => {
              const img = imageOf(x.image, locale);
              const inner = (
                <>
                  {img && (
                    <div className="relative aspect-[16/9] overflow-hidden">
                      <Picture image={img} sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 80vw" decorative className="size-full" imgClassName="transition-transform duration-700 group-hover:scale-105" />
                      <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-void via-void/20 to-transparent" />
                    </div>
                  )}
                  <div className={cn("relative flex gap-3 p-4 sm:gap-4 sm:p-6", img && "-mt-8")}>
                    {x.icon && (
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--line-2)] bg-void/80 text-cyan backdrop-blur sm:size-12">
                        <Icon name={iconOf(x.icon)} size={22} />
                      </span>
                    )}
                    <span className="flex min-w-0 flex-col gap-1.5">
                      {x.tag && tx(x.tag, locale) && <span className="t-eyebrow text-[0.62rem] text-cyan">{tx(x.tag, locale)}</span>}
                      <span className={cn("block text-chalk", b.layout === "two" ? "t-headline text-2xl sm:text-3xl" : "font-semibold")} dir="auto">
                        {tx(x.title, locale)}
                      </span>
                      <span className="block text-sm leading-relaxed text-mist sm:text-base">{tx(x.body, locale)}</span>
                    </span>
                  </div>
                </>
              );
              return (
                <li key={k} className={cn("frame group overflow-hidden", swipe && "w-[80%] shrink-0 snap-start sm:w-auto")}>
                  {x.href ? (
                    <a href={asset(x.href)} className="block h-full">
                      {inner}
                    </a>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
          {!!b.links.length && (
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
              {b.links.map((x, k) => (
                <a key={k} href={asset(x.href)} target="_blank" rel="noopener" className="inline-flex items-center gap-2 text-sm font-semibold text-cyan hover:underline">
                  <Icon name={/\.pdf$/i.test(x.href) ? "book" : "external"} size={16} />
                  {tx(x.label, locale)}
                </a>
              ))}
            </div>
          )}
        </>
      );
    }
    case "steps":
      return (
        <>
          {header}
          <ol className={cn(head, "grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4")}>
            {b.items.map((s, k) => (
              <li key={k} className="frame flex flex-col gap-1.5 p-4 sm:gap-3 sm:p-6">
                <span className="t-headline text-2xl text-cyan sm:text-4xl">{String(k + 1).padStart(2, "0")}</span>
                <span className="font-semibold text-chalk">{tx(s.title, locale)}</span>
                <span className="text-xs leading-relaxed text-mist sm:text-sm">{tx(s.body, locale)}</span>
              </li>
            ))}
          </ol>
        </>
      );
    case "form":
      return (
        <>
          {header}
          <div className={cn(head, "mx-auto grid max-w-3xl gap-6")}>
            {b.counter && b.form && <DelegationCounter slug={b.form} going={l.going} left={l.left} full={l.full} closed={l.closed} />}
            {b.form ? (
              <FormFiller locale={locale} listHref={`${BASE_PATH}${locale === "en" ? "" : "/ar"}/forms`} slug={b.form} statusHref={pageHref(slug, locale)} />
            ) : (
              <p className="frame p-6 text-mist">—</p>
            )}
          </div>
        </>
      );
    case "status":
      return (
        <>
          {header}
          <div className={cn(head, "mx-auto max-w-4xl")}>
            <FormStatus locale={locale} />
          </div>
        </>
      );
    case "timeline":
      return (
        <>
          {header}
          <div className={cn(head, "grid gap-6", b.aside.length && "lg:grid-cols-[1.6fr_1fr]")}>
            <ol className="relative grid gap-3 border-s border-[var(--line-2)] ps-6 sm:gap-4">
              {b.items.map((x, k) => (
                <li key={k} className="relative">
                  <span aria-hidden className="absolute -start-[2.15rem] top-4 flex size-5 items-center justify-center rounded-full border-2 bg-void text-[0.6rem] font-bold" style={{ borderColor: accent, color: accent }}>
                    {k + 1}
                  </span>
                  <div className="frame flex gap-3 p-4 sm:gap-4 sm:p-5">
                    <Icon name={iconOf(x.icon)} size={22} className="mt-0.5 shrink-0 text-cyan" />
                    <span>
                      <span className="block font-semibold text-chalk">{tx(x.title, locale)}</span>
                      <span className="mt-1 block text-sm leading-relaxed text-mist">{tx(x.body, locale)}</span>
                    </span>
                  </div>
                </li>
              ))}
            </ol>
            {!!b.aside.length && (
              <aside className="frame h-fit p-5 sm:p-6">
                <p className="t-eyebrow text-[0.62rem]" style={{ color: accent }}>
                  {tx(b.asideTitle, locale)}
                </p>
                <ul className="mt-4 grid gap-3">
                  {b.aside.map((x, k) => (
                    <li key={k} className="flex items-center gap-3 text-sm text-mist sm:text-base">
                      <Icon name="check" size={18} className="shrink-0 text-ok" />
                      {tx(x, locale)}
                    </li>
                  ))}
                </ul>
              </aside>
            )}
          </div>
        </>
      );
    case "photos": {
      const items: WallImage[] = b.items.flatMap((x, k) => {
        const img = imageOf(x, locale);
        if (!img) return [];
        const thumb = (img.webp || img.src).split(", ")[0]!.split(" ")[0]!;
        return [{ id: `${k}`, src: img.src, srcSet: img.webp || img.src, thumb, alt: img.alt, caption: img.alt, tag: "", w: img.width, h: img.height, placeholder: img.placeholder }];
      });
      return (
        <>
          {header}
          {!!items.length && (
            <div className={head} data-testid="page-photos">
              <MediaWallGrid items={items} labels={l.lightbox} />
            </div>
          )}
          {b.album && (
            <div className={items.length ? "mt-12" : head}>
              <p className="t-eyebrow text-[0.62rem]" style={{ color: accent }}>
                {tx(b.albumTitle, locale) || l.album}
              </p>
              <div className="mt-4">
                <LiveGallery locale={locale} tag={b.album} empty={tx(b.albumEmpty, locale) || l.albumEmpty} />
              </div>
            </div>
          )}
        </>
      );
    }
    case "faq":
      return (
        <>
          {header}
          <div className={cn(head, "grid gap-3 md:grid-cols-2")}>
            {b.items.map((x, k) => (
              <details key={k} className="frame group p-5 sm:p-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-chalk">
                  {tx(x.q, locale)}
                  <Icon name="chevronDown" size={18} className="shrink-0 text-fog transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 whitespace-pre-line leading-relaxed text-mist">{tx(x.a, locale)}</p>
              </details>
            ))}
          </div>
        </>
      );
    case "buttons":
      return (
        <>
          {header}
          <Buttons buttons={b.buttons} locale={locale} className={head} />
        </>
      );
    case "video": {
      const id = b.url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/)?.[1];
      return (
        <>
          {header}
          {id && (
            <div className={cn(head, "frame aspect-video overflow-hidden")}>
              <iframe src={`https://www.youtube-nocookie.com/embed/${id}`} title={title || "video"} loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen className="size-full" />
            </div>
          )}
        </>
      );
    }
    default:
      return null;
  }
}

/** Where a page lives on the site (in this language). */
export function pageHref(slug: string, locale: string) {
  const base = `${BASE_PATH}${locale === "en" ? "" : "/ar"}`;
  return slug === "robotex" ? `${base}/robotex/` : `${base}/p/?s=${encodeURIComponent(slug)}`;
}

export function SitePageView({ page, locale, crumbs, preview }: { page: SitePage; locale: string; crumbs?: { label: string; href?: string }[]; preview?: boolean }) {
  const blocks = page.blocks.filter((b) => !b.hidden);
  const hero = blocks.find((b): b is HeroBlock => b.type === "hero");
  const rest = blocks.filter((b) => b !== hero);
  const nav = page.settings.nav ? rest.filter((b) => tx(b.nav, locale)) : [];
  const form = rest.find((b) => b.type === "form");
  const c = hero?.countdown;
  const l = L[locale === "en" ? "en" : "ar"];
  return (
    <>
      {hero && <Hero b={hero} locale={locale} accent={page.accent} crumbs={crumbs} />}
      {nav.length > 1 && (
        <nav aria-label={tx(page.title, locale)} className="border-y border-[var(--line)] bg-[rgb(5_14_38/0.88)]" data-testid="page-nav">
          <ul className="mx-auto flex max-w-[1680px] gap-2 overflow-x-auto px-5 py-2.5 [scrollbar-width:none] sm:px-8">
            {nav.map((b) => (
              <li key={b.id} className="shrink-0">
                <a href={`#${anchorOf(b)}`} className="block rounded-full border border-[var(--line-2)] px-3.5 py-1.5 text-sm text-mist transition-colors hover:border-cyan/50 hover:text-chalk">
                  {tx(b.nav, locale)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {!hero && <div className="pt-24" />}
      {rest.map((b, i) => (
        <Band key={b.id} tight alt={i % 2 === 1} id={anchorOf(b)} className="scroll-mt-28">
          <Section b={b} i={i + 1} locale={locale} accent={page.accent} slug={page.slug} />
        </Band>
      ))}
      {!preview && page.settings.applyBar && form && c && Date.parse(c.start) > 0 && (
        <ExpoApplyBar
          label={tx(hero?.buttons.find((x) => x.primary)?.label, locale) || l.apply}
          days={l.days}
          target={anchorOf(form)}
          start={Date.parse(c.start)}
          end={Date.parse(c.end) || Date.parse(c.start) + 864e5}
        />
      )}
    </>
  );
}

/** The team's saved version of a page (published), else the built-in one. */
export function LiveSitePage({ slug, locale, fallback, crumbs }: { slug?: string; locale: string; fallback?: SitePage; crumbs?: { label: string; href?: string }[] }) {
  const [page, setRaw] = useState<SitePage | null | undefined>(fallback);
  // As a transition: the rest of the page may still be hydrating when the answer arrives.
  const setPage = (v: SitePage | null | ((x: SitePage | null | undefined) => SitePage | null | undefined)) => startTransition(() => setRaw(v));
  const [name, setName] = useState(slug);
  useEffect(() => {
    const s = slug ?? new URLSearchParams(location.search).get("s") ?? "";
    if (s !== slug) setName(s);
    // Nothing to show instead of the built-in page: leave it alone (no re-render while it hydrates).
    const missing = () => {
      if (!fallback) setPage((x) => x ?? null);
    };
    if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(s)) {
      missing();
      return;
    }
    let alive = true;
    // Kept for a minute in this visit: moving between pages doesn't ask the database again.
    const key = `bx-page-${s}`;
    let cached: { at: number; raw: unknown } | null = null;
    try {
      cached = JSON.parse(sessionStorage.getItem(key) ?? "null");
    } catch {}
    const fresh = cached && Date.now() - cached.at < 60_000;
    (fresh
      ? Promise.resolve(cached!.raw)
      : fetch(`${SUPABASE_URL}/rest/v1/rpc/site_page`, { method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ p_slug: s }), signal: AbortSignal.timeout(6000) })
          .then((r) => (r.ok ? r.json() : null))
          .then((raw: unknown) => {
            try {
              sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), raw }));
            } catch {}
            return raw;
          })
    )
      .then((raw) => {
        if (!alive) return;
        const p = cleanPage(raw);
        if (p) {
          setPage(p);
          if (!fallback) document.title = `${tx(p.title, locale)} · BuildX HUE`;
        } else missing();
      })
      .catch(() => alive && missing());
    return () => {
      alive = false;
    };
  }, [slug, fallback, locale]);
  if (page === undefined) return <div className="min-h-[60vh] animate-pulse pt-28" aria-busy="true" />;
  if (!page)
    return (
      <Band tight className="pt-32">
        <p className="frame mx-auto max-w-xl p-8 text-center text-mist" data-testid="page-missing" data-slug={name}>
          {L[locale === "en" ? "en" : "ar"].missing}
        </p>
      </Band>
    );
  return <SitePageView page={page} locale={locale} crumbs={crumbs} />;
}
