import type { Metadata } from "next";
import { LiveSitePage } from "@/components/pages/site-page";
import { EXPO_OG } from "@/content/expo-photos";
import { expoVisit } from "@/content/expo-visit";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";
import { robotexPage } from "@/lib/site-pages";

export const revalidate = 3600;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await resolvePage(params);
  const c = expoVisit(locale);
  return pageMeta({ locale, path: "/robotex", title: c.meta.title, description: c.meta.description, image: EXPO_OG });
}

/**
 * The team's visit to Robotex & NDTX Expo 2026. The page is built from blocks the team can edit
 * and reorder in the BuildX App (صفحات الموقع → صفحة المعرض); until they save their own version,
 * the built-in one (src/lib/site-pages.ts) shows, and it's what search engines and slow phones get
 * first either way.
 */
export default async function RobotexVisit({ params }: Params) {
  const { locale, t, href } = await resolvePage(params);
  return <LiveSitePage slug="robotex" locale={locale} fallback={robotexPage()} crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.events, href: href("/events") }, { label: t.nav.expo }]} />;
}
