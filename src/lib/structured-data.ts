/** schema.org objects shared by the pre-rendered pages. */
import type { Locale } from "@/i18n/config";
import { SITE_URL } from "./seo";

export const ORG_ID = `${SITE_URL}/#organization`;

export const pageUrl = (locale: Locale, path: string) => `${SITE_URL}${locale === "ar" ? "/ar" : ""}${path === "/" ? "" : path}/`.replace(/\/+$/, "/");

export const organizationRef = { "@type": "Organization", "@id": ORG_ID, name: "BuildX HUE", url: `${SITE_URL}/`, logo: `${SITE_URL}/brand/icon-512.png` };

/** Horus University, where the community meets. */
export const campus = {
  "@type": "Place",
  name: "Horus University – Egypt",
  address: { "@type": "PostalAddress", addressLocality: "New Damietta", addressRegion: "Damietta", addressCountry: "EG" },
};

export function breadcrumbs(locale: Locale, items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: pageUrl(locale, it.path) })),
  };
}
