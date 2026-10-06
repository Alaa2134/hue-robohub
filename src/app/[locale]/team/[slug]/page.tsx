import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/brand/icons";
import { Mark } from "@/components/brand/logo";
import { SOCIAL_LABEL, SocialIcon, safeHref } from "@/components/brand/social-icons";
import { Picture } from "@/components/media/picture";
import { Reveal } from "@/components/motion/reveal";
import { Band } from "@/components/pages/section";
import { Monogram } from "@/components/people/member-card";
import { ButtonLink } from "@/components/ui/button";
import { formatDate, PROJECT_STATUS_LABEL } from "@/lib/format";
import { badgeTier, DEPARTMENT_LABEL, RANK_LABEL, RANK_LABEL_AR } from "@/lib/members";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta, SITE_URL } from "@/lib/seo";
import { getPublicMember } from "@/server/queries/public";

export const revalidate = 3600;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

type P = Params<{ slug: string }>;

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { locale, slug } = await resolvePage(params);
  const m = await getPublicMember(slug);
  if (!m) return {};
  return pageMeta({ locale, path: `/team/${slug}`, title: m.fullName, description: m.title ?? RANK_LABEL[m.rank], image: m.ogImage });
}

export default async function MemberProfile({ params }: P) {
  const { locale, t, p, href, slug } = await resolvePage(params);
  const m = await getPublicMember(slug);
  if (!m) notFound();
  const accent = m.team?.accent ?? (badgeTier(m.rank) === "founder" ? "#e8b45c" : "#2b6dff");
  const rank = (locale === "ar" ? RANK_LABEL_AR : RANK_LABEL)[m.rank];
  const socials = (Object.entries(m.socials) as [keyof typeof SOCIAL_LABEL, string | null][]).map(([k, v]) => [k, safeHref(v)] as const).filter(([, v]) => !!v);
  const person = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: m.fullName,
    jobTitle: m.title ?? rank,
    memberOf: { "@type": "Organization", name: "BuildX HUE", url: SITE_URL },
    sameAs: socials.map(([, v]) => v),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(person).replace(/</g, "\\u003c") }} />
      <section className="relative overflow-hidden pt-28 lg:pt-36">
        <div aria-hidden className="grid-lines mask-radial absolute inset-0 opacity-40" />
        <div aria-hidden className="absolute inset-x-0 top-0 h-[60%]" style={{ background: `radial-gradient(60% 70% at 30% 20%, color-mix(in oklab, ${accent} 18%, transparent), transparent 70%)` }} />
        <div className="relative mx-auto grid max-w-[1680px] gap-10 px-5 pb-16 sm:px-8 lg:grid-cols-12 lg:pb-24">
          <div className="lg:col-span-5">
            <div className="frame relative mx-auto aspect-[4/5] max-w-md overflow-hidden !rounded-[22px] lg:mx-0" style={{ ["--edge" as string]: 0.6 }}>
              {m.photo ? <Picture image={m.photo} sizes="(min-width:1024px) 34vw, 90vw" priority alt={m.fullName} className="absolute inset-0 h-full w-full" /> : <Monogram name={m.fullName} accent={accent} className="absolute inset-0" />}
              <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-void/80 via-transparent to-transparent" />
              {m.team && <span aria-hidden className="absolute inset-y-0 start-0 w-1" style={{ background: m.team.accent }} />}
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-5">
                <span className="font-mono text-[0.65rem] tracking-[0.2em] text-mist">BUILDX HUE · MEMBER</span>
                <Mark tone="white" className="h-6 w-auto opacity-80" />
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-end lg:col-span-7">
            <Link href={href("/team")} className="mb-8 inline-flex items-center gap-2 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-fog hover:text-chalk">
              <Icon name="arrow" size={14} className="rotate-180 rtl:rotate-0" />
              {p.team.back}
            </Link>
            <p className="enter t-eyebrow" style={{ color: accent, ["--d" as string]: "100ms" }}>
              {rank}
              {m.department ? ` · ${DEPARTMENT_LABEL[m.department]}` : ""}
            </p>
            <h1 className="enter t-display mt-4 text-[clamp(2.6rem,6.5vw,5.6rem)] text-chalk" style={{ ["--d" as string]: "200ms" }}>
              {m.fullName}
            </h1>
            {m.title && (
              <p className="enter mt-3 text-xl text-frost" style={{ ["--d" as string]: "300ms" }}>
                {m.title}
              </p>
            )}
            <div className="enter mt-6 flex flex-wrap gap-2" style={{ ["--d" as string]: "380ms" }}>
              {m.track && (
                <Link href={href(`/tracks/${m.track.slug}`)} className="rounded-full border border-[var(--line-2)] px-3 py-1.5 text-sm text-mist hover:text-chalk">
                  {m.track.name}
                </Link>
              )}
              {m.team && (
                <Link href={href(`/competitions/${m.team.slug}`)} className="rounded-full border px-3 py-1.5 text-sm" style={{ borderColor: `color-mix(in oklab, ${m.team.accent} 55%, transparent)`, color: m.team.accent }}>
                  {m.team.name}
                </Link>
              )}
              {m.joinedAt && <span className="rounded-full border border-[var(--line)] px-3 py-1.5 text-sm text-fog">{p.team.joined} {formatDate(m.joinedAt, locale, { month: "short", year: "numeric" })}</span>}
            </div>
            {socials.length > 0 && (
              <div className="enter mt-8 flex gap-1.5" style={{ ["--d" as string]: "460ms" }}>
                {socials.map(([k, v]) => (
                  <a key={k} href={v!} target="_blank" rel="noopener noreferrer me" aria-label={SOCIAL_LABEL[k]} className="btn btn-icon">
                    <SocialIcon name={k} className="size-[17px]" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <Band alt>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            {m.bio && (
              <Reveal>
                <p className="t-eyebrow text-fog">{p.team.bio}</p>
                <p className="mt-5 whitespace-pre-line text-pretty text-lg leading-relaxed text-frost">{m.bio}</p>
              </Reveal>
            )}
            {m.projects.length > 0 && (
              <div className="mt-12">
                <p className="t-eyebrow text-fog">{p.team.projects}</p>
                <ul className="mt-5 divide-y divide-[var(--line)] border-y border-[var(--line)]">
                  {m.projects.map((pr) => (
                    <li key={pr.slug}>
                      <Link href={href(`/projects/${pr.slug}`)} className="group flex items-center justify-between gap-4 py-4">
                        <span className="min-w-0">
                          <span className="block truncate text-chalk group-hover:text-cyan">{pr.title}</span>
                          <span className="block truncate text-sm text-fog">
                            {pr.role} · {PROJECT_STATUS_LABEL[pr.status] ?? pr.status}
                          </span>
                        </span>
                        <Icon name="arrow" size={16} className="shrink-0 text-fog rtl:-scale-x-100" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-6 lg:col-span-5">
            {m.skills.length > 0 && (
              <div className="frame p-6">
                <p className="t-eyebrow text-fog">{p.team.skills}</p>
                <ul className="mt-4 flex flex-wrap gap-1.5">
                  {m.skills.map((s) => (
                    <li key={s} className="rounded-md border border-[var(--line-2)] px-2.5 py-1 text-sm text-frost">
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {m.achievements.length > 0 && (
              <div className="frame p-6">
                <p className="t-eyebrow text-fog">{p.team.achievements}</p>
                <ul className="mt-4 space-y-3">
                  {m.achievements.map((a) => (
                    <li key={a.id} className="flex items-start gap-3 text-sm">
                      <Icon name="trophy" size={16} className="mt-0.5 shrink-0 text-gold" />
                      <span>
                        <span className="block text-chalk">{a.title}</span>
                        {a.achievedOn && <span className="text-fog">{formatDate(a.achievedOn, locale)}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <ButtonLink href={href("/join")} variant="primary" arrow className="self-start">
              {t.nav.join}
            </ButtonLink>
          </div>
        </div>
      </Band>
    </>
  );
}
