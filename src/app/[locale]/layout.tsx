import "../globals.css";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { SmoothScroll } from "@/components/motion/smooth-scroll";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { MenuSheet, type MenuPreview } from "@/components/site/menu-sheet";
import { SearchDialog, type SearchSeed } from "@/components/site/search-dialog";
import { TabBar } from "@/components/site/tab-bar";
import { MENU_GROUPS } from "@/components/site/nav";
import { dirOf, getDictionary, isLocale, LOCALES, type Locale } from "@/i18n";
import { fontVariables } from "@/lib/fonts";
import { art, artUrl } from "@/lib/media-library";
import { HOME_TITLE, pageMeta, SITE_URL } from "@/lib/seo";
import { campus, ORG_ID } from "@/lib/structured-data";
import { JsonLd } from "@/components/seo/json-ld";
import { STATIC_SITE } from "@/lib/deploy";
import { staticSiteCsp } from "@/lib/security-headers";
import { SUPABASE_URL } from "@/lib/supabase-public";
import { getSiteConfig, getTeams, getTracks } from "@/server/queries/public";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}
export const dynamicParams = false;

export const viewport: Viewport = {
  themeColor: "#050e26",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const config = await getSiteConfig();
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: HOME_TITLE[locale], template: "%s — BuildX HUE" },
    description: (locale === "ar" && config["site.seo"].descriptionAr) || config["site.seo"].description,
    keywords: config["site.seo"].keywords,
    applicationName: "BuildX HUE",
    icons: {
      icon: [
        { url: "/brand/favicon.svg", type: "image/svg+xml" },
        { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      ],
      apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180" }],
    },
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "BuildX HUE", statusBarStyle: "black-translucent" },
    formatDetection: { telephone: false },
    // Search Console ownership (set GOOGLE_SITE_VERIFICATION, or verify the domain with a DNS record).
    ...(process.env.GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } } : {}),
    ...pageMeta({ locale, path: "/", description: (locale === "ar" && config["site.seo"].descriptionAr) || config["site.seo"].description }),
  };
}

const PREVIEWS: { key: MenuPreview["key"]; href: string; art: string[]; caption: { en: string; ar: string } }[] = [
  { key: "tracks", href: "/tracks", art: ["track_embedded", "hero"], caption: { en: "Five disciplines. One machine.", ar: "خمسة تخصصات. آلة واحدة." } },
  { key: "projects", href: "/projects", art: ["showcase", "track_software", "hero"], caption: { en: "From ideas to real robots.", ar: "من الأفكار إلى روبوتات حقيقية." } },
  { key: "competitions", href: "/competitions", art: ["arena", "team_sprint", "hero"], caption: { en: "Built to compete.", ar: "صُممت لتنافس." } },
  { key: "bootcamp", href: "/bootcamp", art: ["bootcamp", "bootcamp_7", "hero"], caption: { en: "From basics to competition.", ar: "من الأساسيات إلى المنافسة." } },
  { key: "team", href: "/team", art: ["team_env", "hero"], caption: { en: "The people building it.", ar: "الأشخاص الذين يبنونه." } },
  { key: "achievements", href: "/achievements", art: ["trophy", "team_innovation", "hero"], caption: { en: "Results, logged.", ar: "نتائج موثّقة." } },
  { key: "join", href: "/join", art: ["recruit", "hero"], caption: { en: "Let's build the next generation of innovators.", ar: "يلا نبني الجيل الجاي من المبتكرين." } },
];

export default async function SiteLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const t = getDictionary(locale);
  const [config, tracks, teams] = await Promise.all([getSiteConfig(), getTracks(), getTeams()]);

  const previews: MenuPreview[] = PREVIEWS.map((p) => {
    const e = art(...p.art);
    return { key: p.key, href: p.href, image: e ? artUrl(e, 1080) : null, caption: p.caption[locale] };
  });

  const seeds: SearchSeed[] = [
    { title: t.nav.home, subtitle: "BuildX HUE", href: "/", kind: "page" },
    ...MENU_GROUPS.flatMap((g) => g.items.map((n) => ({ title: t.nav[n.key], subtitle: t.nav[g.key], href: n.href, kind: "page" as const }))),
    { title: t.nav.join, subtitle: t.join.title, href: "/join", kind: "page" },
    ...tracks.map((tr) => ({ title: (locale === "ar" && tr.nameAr) || tr.name, subtitle: (locale === "ar" && tr.taglineAr) || tr.tagline, href: `/tracks/${tr.slug}`, kind: "track" as const })),
    ...teams.map((tm) => ({ title: (locale === "ar" && tm.nameAr) || tm.name, subtitle: tm.discipline, href: `/competitions/${tm.slug}`, kind: "team" as const })),
  ];

  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: "BuildX HUE",
    alternateName: ["BuildX HUE — Student Innovation & Robotics Community", "بيلد إكس حورس"],
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/brand/icon-512.png`,
    slogan: "Build • Innovate • Compete",
    description: (locale === "ar" && config["site.seo"].descriptionAr) || config["site.seo"].description,
    address: campus.address,
    parentOrganization: { "@type": "CollegeOrUniversity", name: "Horus University – Egypt", url: "https://www.horus.edu.eg/" },
    sameAs: Object.values(config["site.socials"]).filter((v) => /^https?:\/\//.test(v)),
  };
  const website = { "@context": "https://schema.org", "@type": "WebSite", "@id": `${SITE_URL}/#website`, name: "BuildX HUE", url: `${SITE_URL}/`, inLanguage: ["en", "ar"], publisher: { "@id": ORG_ID } };

  return (
    <html lang={locale} dir={dirOf(locale)} className={fontVariables} suppressHydrationWarning>
      <head>
        {STATIC_SITE && <meta httpEquiv="Content-Security-Policy" content={staticSiteCsp(SUPABASE_URL)} />}
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <JsonLd data={[org, website]} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          {t.meta.skip}
        </a>
        <Header locale={locale} t={t.nav} />
        <MenuSheet locale={locale} t={t.nav} previews={previews} socials={config["site.socials"]} email={config["site.contact"].email} />
        <SearchDialog locale={locale} t={{ ...t.search, close: t.nav.close }} seeds={seeds} />
        <main id="main" tabIndex={-1} className="outline-none">
          {children}
        </main>
        <Footer locale={locale} t={t} config={config} />
        <TabBar locale={locale} t={t.nav} />
        <SmoothScroll />
      </body>
    </html>
  );
}

