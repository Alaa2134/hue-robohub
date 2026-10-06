export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(v: string | undefined | null): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}

export function dirOf(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** English lives at the root (/team); other locales are prefixed (/ar/team). */
export function localePath(locale: Locale, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return clean;
  return clean === "/" ? `/${locale}` : `/${locale}${clean}`;
}

/**
 * Strip any locale prefix from a pathname. English is served without a prefix, but its pages are rendered
 * from /en/* (proxy rewrite, static export), so "/en/about" and "/about" must normalise to the same path.
 */
export function stripLocale(pathname: string): { locale: Locale; path: string } {
  const m = pathname.match(/^\/(ar|en)(\/.*)?$/);
  if (m) return { locale: m[1] as Locale, path: m[2] || "/" };
  return { locale: "en", path: pathname || "/" };
}
