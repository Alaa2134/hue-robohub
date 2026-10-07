import type { Metadata } from "next";
import type { Locale } from "@/i18n/config";
import { art } from "./media-library";

export const SITE_URL = (
  process.env.APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
  "http://localhost:3000"
).replace(/\/$/, "");

/** Title of the home page (and of pages without their own). */
export const HOME_TITLE: Record<Locale, string> = {
  en: "BuildX HUE — Student Innovation & Robotics Community",
  ar: "BuildX HUE — مجتمع الابتكار والروبوتات في جامعة حورس",
};

/** Canonical + hreflang alternates for a locale-agnostic path ("/team"). */
export function alternates(locale: Locale, path: string): Metadata["alternates"] {
  const ar = `/ar${path === "/" ? "" : path}`;
  return { canonical: locale === "en" ? path : ar, languages: { en: path, ar, "x-default": path } };
}

/**
 * Page metadata with Open Graph + Twitter cards. `image` is an absolute or root-relative URL; `type`
 * and `published` describe articles and profiles; `noindex` keeps helper pages out of search results.
 */
export function pageMeta({
  locale,
  path,
  title,
  description,
  image,
  type = "website",
  published,
  noindex,
}: {
  locale: Locale;
  path: string;
  title?: string;
  description?: string;
  image?: string | null;
  type?: "website" | "article" | "profile";
  published?: string | null;
  noindex?: boolean;
}): Metadata {
  const fallback = art("hero")?.og ?? "/brand/icon-512.png";
  const og = image ?? fallback;
  const full = title ? `${title} — BuildX HUE` : HOME_TITLE[locale];
  return {
    // Spelled out per page: an undefined title would blank the layout's default, and the layout's
    // template does not reach pages rendered from the same segment.
    title: { absolute: full },
    description,
    alternates: alternates(locale, path),
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      type,
      siteName: "BuildX HUE",
      locale: locale === "ar" ? "ar_EG" : "en_US",
      alternateLocale: locale === "ar" ? "en_US" : "ar_EG",
      url: locale === "en" ? path : `/ar${path === "/" ? "" : path}`,
      title: full,
      description,
      images: [image ? { url: og } : { url: og, width: 1200, height: 675 }],
      ...(type === "article" && published ? { publishedTime: published } : {}),
    },
    twitter: { card: "summary_large_image", title: title ?? "BuildX HUE", description, images: [og] },
  };
}
