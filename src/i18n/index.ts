import en, { type Dictionary } from "./en";
import ar from "./ar";
import type { Locale } from "./config";

const dictionaries: Record<Locale, Dictionary> = { en, ar };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? en;
}

export type { Dictionary };
export * from "./config";
