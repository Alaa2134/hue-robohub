import type { Metadata } from "next";
import { LiveSitePage } from "@/components/pages/site-page";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";

export const revalidate = 3600;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await resolvePage(params);
  // One page for every page built in the app (/p/?s=<slug>, and /p/<slug> forwards here).
  return pageMeta({ locale, path: "/p", title: locale === "ar" ? "صفحة" : "Page", noindex: true });
}

export default async function BuiltPage({ params }: Params) {
  const { locale } = await resolvePage(params);
  return <LiveSitePage locale={locale} />;
}
