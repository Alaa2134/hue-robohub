"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/brand/icons";
import { coreTracks } from "@/content/core-content";
import { cn } from "@/lib/cn";
import { fetchTeam, headlineOf, nameOf, safeUrl, teamImageUrl, type TeamProfile } from "@/lib/team-public";

const T = {
  en: { founders: "Founding team", team: "The team", visit: "Visit portfolio", view: "View portfolio", empty: "Team portfolios are on their way.", error: "We couldn't load the team right now." },
  ar: { founders: "الفريق المؤسس", team: "الفريق", visit: "زور البورتفوليو", view: "شوف البورتفوليو", empty: "بورتفوليوهات الفريق جاية قريب.", error: "مقدرناش نحمّل الفريق دلوقتي." },
};

export const trackName = (slug: string | null | undefined, locale: string) => {
  const t = coreTracks.find((x) => x.slug === slug);
  return t ? (locale === "ar" ? t.nameAr : t.name) : "";
};

export function Avatar({ p, locale, className, thumb }: { p: TeamProfile; locale: string; className?: string; thumb?: boolean }) {
  const name = nameOf(p, locale);
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  return (
    <span className={cn("relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-volt/60 via-volt-lo/60 to-cyan/40", className)}>
      {p.photo_path ? (
        <img src={teamImageUrl(p.photo_path, thumb ? "thumb" : "full")} alt={name} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span className="t-display text-4xl text-white/90" aria-hidden>
          {initials}
        </span>
      )}
    </span>
  );
}

function MemberCard({ p, locale, href, big }: { p: TeamProfile; locale: string; href: string; big?: boolean }) {
  const t = T[locale === "ar" ? "ar" : "en"];
  const external = safeUrl(p.external_url);
  const track = trackName(p.track, locale);
  const body = (
    <>
      <Avatar p={p} locale={locale} thumb className={cn("w-full", big ? "aspect-[4/5]" : "aspect-square")} />
      <div className="flex flex-1 flex-col gap-2 p-5">
        <p className="t-title text-xl text-chalk">{nameOf(p, locale)}</p>
        {headlineOf(p, locale) && <p className="text-[0.95rem] text-mist">{headlineOf(p, locale)}</p>}
        {track && <span className="w-fit rounded-full bg-volt/15 px-3 py-0.5 text-sm font-semibold text-volt-hi">{track}</span>}
        {p.skills.length > 0 && <p className="line-clamp-1 text-sm text-fog">{p.skills.slice(0, 4).join(" · ")}</p>}
        <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-semibold text-cyan">
          {external ? (
            <>
              {t.visit} <span dir="ltr">· {external.replace(/^https:\/\//, "").replace(/\/$/, "")}</span>
              <Icon name="arrowUpRight" size={15} />
            </>
          ) : (
            <>
              {t.view}
              <Icon name="arrow" size={15} className="rtl:-scale-x-100" />
            </>
          )}
        </span>
      </div>
    </>
  );
  const cls = "group flex h-full flex-col overflow-hidden rounded-[20px] border border-[var(--line-2)] bg-panel/70 transition-[transform,border-color] duration-300 hover:-translate-y-1 hover:border-cyan/50";
  return external ? (
    <a href={external} target="_blank" rel="noopener noreferrer" className={cls}>
      {body}
    </a>
  ) : (
    <Link href={`${href}${encodeURIComponent(p.slug)}/`} className={cls}>
      {body}
    </Link>
  );
}

/**
 * Live team directory (published portfolios). `founders` shows only the founding team. `memberHref` is
 * the team page ("/team/"): portfolios live at /team/<slug>/. `initial` is the list read at build time.
 */
export function TeamDirectory({ locale, memberHref, variant = "full", initial }: { locale: string; memberHref: string; variant?: "full" | "founders"; initial?: TeamProfile[] }) {
  const t = T[locale === "ar" ? "ar" : "en"];
  const [list, setList] = useState<TeamProfile[] | null>(initial?.length ? initial : null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchTeam()
      .then((r) => alive && setList(r))
      .catch(() => alive && !initial?.length && setFailed(true));
    return () => {
      alive = false;
    };
  }, [initial]);

  if (failed) return variant === "full" ? <p className="rounded-xl border border-[var(--line)] p-6 text-center text-mist">{t.error}</p> : null;
  if (!list)
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
        {Array.from({ length: variant === "founders" ? 4 : 8 }, (_, i) => (
          <div key={i} className="aspect-[4/5] animate-pulse rounded-[20px] bg-panel/60" />
        ))}
      </div>
    );

  const founders = list.filter((p) => p.group_kind === "founder");
  const rest = list.filter((p) => p.group_kind !== "founder");
  if (variant === "founders" && !founders.length) return null;
  if (!list.length) return <p className="rounded-xl border border-[var(--line)] p-6 text-center text-mist">{t.empty}</p>;

  return (
    <div className="flex flex-col gap-14">
      {founders.length > 0 && (
        <section aria-label={t.founders}>
          {variant === "full" && <h2 className="t-headline mb-6 text-2xl text-chalk">{t.founders}</h2>}
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {founders.map((p) => (
              <li key={p.id}>
                <MemberCard p={p} locale={locale} href={memberHref} big />
              </li>
            ))}
          </ul>
        </section>
      )}
      {variant === "full" && rest.length > 0 && (
        <section aria-label={t.team}>
          <h2 className="t-headline mb-6 text-2xl text-chalk">{t.team}</h2>
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {rest.map((p) => (
              <li key={p.id}>
                <MemberCard p={p} locale={locale} href={memberHref} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
