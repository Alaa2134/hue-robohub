"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/brand/icons";
import { LINK_KEYS, LINK_LABEL, bioOf, fetchMember, headlineOf, nameOf, safeUrl, teamImageUrl, type TeamProfile, type TeamProject } from "@/lib/team-public";
import { Avatar, trackName } from "./team-directory";

const T = {
  en: { back: "All team", projects: "Projects & work", skills: "Skills", open: "Open", notFound: "We couldn't find this portfolio.", notFoundBody: "It may have been renamed or unpublished.", error: "We couldn't load this portfolio. Check your connection and try again.", visit: "Visit portfolio" },
  ar: { back: "كل الفريق", projects: "المشاريع والشغل", skills: "المهارات", open: "افتح", notFound: "مش لاقيين البورتفوليو ده.", notFoundBody: "ممكن يكون الرابط اتغيّر أو الصفحة مش منشورة.", error: "مقدرناش نحمّل البورتفوليو. اتأكد من النت وجرّب تاني.", visit: "زور البورتفوليو" },
};

type State = { status: "loading" } | { status: "missing" } | { status: "error" } | { status: "ok"; profile: TeamProfile; projects: TeamProject[] };

/** Portfolio page for one member (the slug comes from ?u=, so one static page serves everyone). */
export function MemberProfile({ locale, teamHref }: { locale: string; teamHref: string }) {
  const t = T[locale === "ar" ? "ar" : "en"];
  const [s, setS] = useState<State>({ status: "loading" });

  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("u") ?? "";
    let alive = true;
    fetchMember(slug)
      .then((r) => {
        if (!alive) return;
        if (!r) return setS({ status: "missing" });
        setS({ status: "ok", ...r });
        document.title = `${nameOf(r.profile, locale)} — BuildX HUE`;
      })
      .catch(() => alive && setS({ status: "error" }));
    return () => {
      alive = false;
    };
  }, [locale]);

  const back = (
    <Link href={teamHref} className="inline-flex items-center gap-2 text-sm font-semibold text-cyan hover:underline">
      <Icon name="arrow" size={15} className="rotate-180 rtl:rotate-0" />
      {t.back}
    </Link>
  );

  if (s.status === "loading")
    return (
      <div className="grid gap-8 lg:grid-cols-[22rem_1fr]" aria-busy="true">
        <div className="aspect-[4/5] animate-pulse rounded-[24px] bg-panel/60" />
        <div className="flex flex-col gap-4">
          <div className="h-12 w-2/3 animate-pulse rounded-lg bg-panel/60" />
          <div className="h-6 w-1/2 animate-pulse rounded-lg bg-panel/60" />
          <div className="h-32 animate-pulse rounded-lg bg-panel/60" />
        </div>
      </div>
    );
  if (s.status !== "ok")
    return (
      <div className="flex flex-col items-start gap-4 rounded-[20px] border border-[var(--line-2)] bg-panel/60 p-8">
        <p className="t-headline text-2xl text-chalk">{s.status === "missing" ? t.notFound : t.error}</p>
        {s.status === "missing" && <p className="text-mist">{t.notFoundBody}</p>}
        {back}
      </div>
    );

  const { profile: p, projects } = s;
  const external = safeUrl(p.external_url);
  const links = LINK_KEYS.map((k) => [k, safeUrl(p.links[k])] as const).filter(([, u]) => u);
  const track = trackName(p.track, locale);
  const bio = bioOf(p, locale);

  return (
    <article className="flex flex-col gap-14">
      <div>{back}</div>
      <header className="grid items-start gap-8 lg:grid-cols-[22rem_1fr] lg:gap-12">
        <Avatar p={p} locale={locale} className="aspect-[4/5] w-full max-w-sm rounded-[24px] border border-[var(--line-2)]" />
        <div className="flex flex-col gap-5">
          <h1 className="t-display text-[clamp(2.4rem,6vw,4.8rem)] text-chalk">{nameOf(p, locale)}</h1>
          {headlineOf(p, locale) && <p className="text-xl text-frost">{headlineOf(p, locale)}</p>}
          {track && <span className="w-fit rounded-full bg-volt/15 px-4 py-1 font-semibold text-volt-hi">{track}</span>}
          {bio && <p className="max-w-3xl whitespace-pre-line text-pretty text-lg leading-relaxed text-mist">{bio}</p>}
          {(links.length > 0 || external) && (
            <div className="flex flex-wrap gap-2.5">
              {external && (
                <a href={external} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                  <span>{t.visit}</span>
                  <Icon name="arrowUpRight" size={15} />
                </a>
              )}
              {links.map(([k, u]) => (
                <a key={k} href={u!} target="_blank" rel="noopener noreferrer nofollow" className="btn">
                  <span>{LINK_LABEL[k]}</span>
                  <Icon name="arrowUpRight" size={14} />
                </a>
              ))}
            </div>
          )}
          {p.skills.length > 0 && (
            <div>
              <h2 className="t-eyebrow mb-3 text-fog">{t.skills}</h2>
              <ul className="flex flex-wrap gap-2">
                {p.skills.map((x) => (
                  <li key={x} className="rounded-full border border-[var(--line-2)] bg-deep/60 px-3.5 py-1.5 text-sm text-frost">
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </header>

      {projects.length > 0 && (
        <section aria-labelledby="projects-title">
          <h2 id="projects-title" className="t-headline mb-6 text-3xl text-chalk">
            {t.projects}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((pr) => {
              const url = safeUrl(pr.url);
              return (
                <li key={pr.id} className="flex flex-col overflow-hidden rounded-[20px] border border-[var(--line-2)] bg-panel/70">
                  {pr.image_path && <img src={teamImageUrl(pr.image_path)} alt="" loading="lazy" className="aspect-video w-full object-cover" />}
                  <div className="flex flex-1 flex-col gap-2 p-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="t-title text-lg text-chalk">{pr.title}</h3>
                      {pr.year && <span className="shrink-0 text-sm text-fog">{pr.year}</span>}
                    </div>
                    {pr.description && <p className="whitespace-pre-line text-[0.95rem] leading-relaxed text-mist">{pr.description}</p>}
                    {pr.tags.length > 0 && <p className="text-sm text-fog">{pr.tags.join(" · ")}</p>}
                    {url && (
                      <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-semibold text-cyan hover:underline">
                        {t.open}
                        <Icon name="arrowUpRight" size={14} />
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </article>
  );
}
