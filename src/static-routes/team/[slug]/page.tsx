import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/seo/json-ld";
import { MemberProfile } from "@/components/team/member-profile";
import { buildMember, buildMembers, slugParams } from "@/lib/build-content";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";
import { breadcrumbs, organizationRef, pageUrl } from "@/lib/structured-data";
import { bioOf, headlineOf, LINK_KEYS, nameOf, safeUrl, teamImageUrl } from "@/lib/team-public";

type P = Params<{ slug: string }>;

export const dynamicParams = false;
export async function generateStaticParams() {
  return slugParams((await buildMembers()).map((m) => m.slug));
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { locale, slug } = await resolvePage(params);
  const m = await buildMember(slug);
  if (!m) return { robots: { index: false } };
  const p = m.profile;
  const name = nameOf(p, locale);
  // A short headline ("Website manager") alone is too thin for search results: say who and where.
  const about = [headlineOf(p, locale), bioOf(p, locale)].filter(Boolean).join(" — ");
  const team = locale === "ar" ? `${name} في فريق BuildX HUE للروبوتات والذكاء الاصطناعي بجامعة حورس.` : `${name} on the BuildX HUE robotics and AI team at Horus University.`;
  const description = (about.length >= 60 ? about : [about, team].filter(Boolean).join(" · ")).slice(0, 160);
  return pageMeta({ locale, path: `/team/${slug}`, title: name, description, image: p.photo_path ? teamImageUrl(p.photo_path) : undefined, type: "profile" });
}

/** A team member's portfolio, pre-rendered from the published profile. */
export default async function Member({ params }: P) {
  const { locale, slug, t, href } = await resolvePage(params);
  const m = await buildMember(slug);
  if (!m) notFound();
  const p = m.profile;
  const name = nameOf(p, locale);
  const person = {
    "@context": "https://schema.org",
    "@type": "Person",
    name,
    alternateName: locale === "ar" ? p.full_name : p.full_name_ar || undefined,
    jobTitle: headlineOf(p, locale) || undefined,
    description: bioOf(p, locale) || undefined,
    image: p.photo_path ? teamImageUrl(p.photo_path) : undefined,
    url: pageUrl(locale, `/team/${slug}`),
    knowsAbout: p.skills.length ? p.skills : undefined,
    sameAs: LINK_KEYS.map((k) => safeUrl(p.links[k])).filter(Boolean),
    memberOf: organizationRef,
  };
  return (
    <div className="mx-auto max-w-[1400px] px-5 pb-24 pt-28 sm:px-8 lg:pt-36">
      <JsonLd
        data={[
          person,
          breadcrumbs(locale, [
            { name: t.nav.home, path: "/" },
            { name: t.nav.team, path: "/team" },
            { name, path: `/team/${slug}` },
          ]),
        ]}
      />
      <MemberProfile locale={locale} teamHref={`${href("/team")}/`} slug={slug} initial={m} />
    </div>
  );
}
