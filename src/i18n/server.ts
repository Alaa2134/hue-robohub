import { notFound } from "next/navigation";
import { getDictionary, isLocale, type Locale } from "./index";

export type LocaleParams = { params: Promise<{ locale: string }> };

export async function resolveLocale(params: Promise<{ locale: string }>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { locale: locale as Locale, t: getDictionary(locale as Locale) };
}

export function canonical(locale: Locale, path: string) {
  return { canonical: locale === "en" ? path : `/ar${path === "/" ? "" : path}`, languages: { en: path, ar: `/ar${path === "/" ? "" : path}` } };
}
