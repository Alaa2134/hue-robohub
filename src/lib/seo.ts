import type { Metadata } from "next";
import type { Locale } from "@/i18n/config";
import { art } from "./media-library";

export const SITE_URL = (
  process.env.APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
  "http://localhost:3000"
).replace(/\/$/, "");

/** Canonical + hreflang alternates for a locale-agnostic path ("/team"). */
export function alternates(locale: Locale, path: string): Metadata["alternates"] {
  const ar = `/ar${path === "/" ? "" : path}`;
  return { canonical: locale === "en" ? path : ar, languages: { en: path, ar, "x-default": path } };
}

/** Page metadata with Open Graph + Twitter cards. `image` is an absolute or root-relative URL. */
export function pageMeta({ locale, path, title, description, image }: { locale: Locale; path: string; title?: string; description?: string; image?: string | null }): Metadata {
  const og = image ?? art("hero")?.og ?? "/brand/icon-512.png";
  return {
    // Spelled out per page: an undefined title would blank the layout's default, and the layout's
    // template does not reach pages rendered from the same segment.
    title: { absolute: title ? `${title} — BuildX HUE` : "BuildX HUE — Student Innovation & Robotics Community" },
    description,
    alternates: alternates(locale, path),
    openGraph: {
      type: "website",
      siteName: "BuildX HUE",
      locale: locale === "ar" ? "ar_EG" : "en_US",
      url: locale === "en" ? path : `/ar${path === "/" ? "" : path}`,
      title: title ? `${title} — BuildX HUE` : "BuildX HUE — Build • Innovate • Compete",
      description,
      images: [{ url: og, width: 1200, height: 675 }],
    },
    twitter: { card: "summary_large_image", title: title ?? "BuildX HUE", description, images: [og] },
  };
}
