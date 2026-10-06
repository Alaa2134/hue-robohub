import { notFound } from "next/navigation";
import { getDictionary, isLocale, localePath, type Locale } from "@/i18n";
import { pageCopy } from "@/i18n/pages";

export type Params<T = object> = { params: Promise<{ locale: string } & T> };

/** Resolve the locale segment once per page: dictionary, page copy and a localized href builder. */
export async function resolvePage<T extends object>(params: Promise<{ locale: string } & T>) {
  const all = await params;
  if (!isLocale(all.locale)) notFound();
  const locale = all.locale as Locale;
  return { ...all, locale, t: getDictionary(locale), p: pageCopy(locale), href: (path: string) => localePath(locale, path) };
}

/** Pick the Arabic variant of a DB field when browsing in Arabic and it exists. */
export function loc(locale: Locale, en: string, ar?: string | null) {
  return locale === "ar" && ar ? ar : en;
}
