"use client";
/**
 * Language on this device: Arabic (the default) or English. Always written in both languages and
 * never translated, so it can be found whichever one is on.
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { appLang, setAppLang, type Lang } from "./i18n";
import { Card, Icon } from "./ui";

const OPTIONS: { lang: Lang; label: string }[] = [
  { lang: "ar", label: "العربية" },
  { lang: "en", label: "English" },
];

function useLang() {
  const [lang, setLang] = useState<Lang | null>(null);
  useEffect(() => setLang(appLang()), []);
  return lang;
}

/** The setting on the More / Profile screen. */
export function LanguageCard({ className }: { className?: string }) {
  const lang = useLang();
  return (
    <Card className={cn("mt-4", className)} translate="no" data-testid="app-language">
      <p className="flex items-center gap-2 font-semibold text-chalk">
        <Icon name="globe" size={18} className="text-cyan" />
        اللغة · Language
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.lang}
            type="button"
            lang={o.lang}
            aria-pressed={lang === o.lang}
            onClick={() => lang !== o.lang && setAppLang(o.lang)}
            className={cn(
              "rounded-xl border px-3 py-2.5 text-sm font-semibold transition",
              lang === o.lang
                ? "border-cyan/60 bg-cyan/10 text-chalk"
                : "border-[var(--line-2)] text-mist hover:text-chalk",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Card>
  );
}

/** A small switch for the sign-in screens: offers the other language. */
export function LangSwitch() {
  const lang = useLang();
  if (!lang) return null;
  const other = OPTIONS.find((o) => o.lang !== lang)!;
  return (
    <button
      type="button"
      translate="no"
      lang={other.lang}
      onClick={() => setAppLang(other.lang)}
      className="flex items-center gap-1 text-sm text-mist hover:text-chalk"
      data-testid="lang-switch"
    >
      <Icon name="globe" size={16} />
      {other.label}
    </button>
  );
}
