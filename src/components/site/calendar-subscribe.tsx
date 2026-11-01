"use client";
/**
 * «Subscribe to the events calendar»: one tap adds the BuildX HUE events feed (supabase/functions/
 * calendar) to Google Calendar, Apple Calendar or Outlook; new events then appear by themselves.
 */
import { useState } from "react";
import { Icon } from "@/components/brand/icons";
import { SUPABASE_URL } from "@/lib/supabase-public";

const T = {
  ar: {
    title: "خلّي الفعاليات تظهر في تقويمك لوحدها",
    body: "اشترك مرة واحدة، وكل فعالية جديدة هتنزل في تقويم موبايلك ومعاها تذكير قبلها بساعتين.",
    google: "Google Calendar",
    apple: "Apple / Outlook",
    copy: "انسخ الرابط",
    copied: "اتنسخ ✓",
  },
  en: {
    title: "Get every event in your calendar, automatically",
    body: "Subscribe once and each new event lands in your phone's calendar, with a reminder two hours before.",
    google: "Google Calendar",
    apple: "Apple / Outlook",
    copy: "Copy link",
    copied: "Copied ✓",
  },
};

export function feedUrl(locale: string) {
  return `${SUPABASE_URL}/functions/v1/calendar?lang=${locale === "en" ? "en" : "ar"}`;
}

export function CalendarSubscribe({ locale }: { locale: string }) {
  const t = T[locale === "en" ? "en" : "ar"];
  const [copied, setCopied] = useState(false);
  const https = feedUrl(locale);
  const webcal = https.replace(/^https:\/\//, "webcal://");
  const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
  const btn =
    "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--line-2)] px-4 text-sm font-semibold text-chalk transition hover:border-volt/60 hover:bg-volt/10";
  return (
    <div
      className="frame flex flex-col gap-4 p-5 sm:flex-row sm:items-center"
      data-testid="calendar-subscribe"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-volt/15 text-volt">
        <Icon name="calendar" size={24} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-chalk">{t.title}</p>
        <p className="mt-1 text-sm text-fog">{t.body}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={google} target="_blank" rel="noreferrer" className={btn} data-testid="cal-google">
          {t.google}
        </a>
        <a href={webcal} className={btn} data-testid="cal-webcal">
          {t.apple}
        </a>
        <button
          type="button"
          className={btn}
          onClick={() => {
            navigator.clipboard?.writeText(https).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          {copied ? t.copied : t.copy}
        </button>
      </div>
    </div>
  );
}
