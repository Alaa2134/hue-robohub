"use client";
/** The owner's announcement (BuildX App → Site settings): a small card above the tab bar, dismissible. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/brand/icons";
import { announcementOf, type SiteSettings } from "@/lib/site-settings";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

type A = { text: string; url: string } | null;
const KEY = "bx_announcement_closed";
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7).toString(36);

export function Announcement({ initial, locale, localePrefix }: { initial: A; locale: string; localePrefix: string }) {
  const [a, setA] = useState<A>(initial);
  const [closed, setClosed] = useState(true);

  // Pick up a change made since the last build.
  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/site_settings?select=value&key=eq.site`, { headers: { apikey: SUPABASE_KEY } })
      .then((r) => (r.ok ? r.json() : null))
      .then((rows: { value: SiteSettings }[] | null) => rows && setA(announcementOf(rows[0]?.value, locale)))
      .catch(() => {});
  }, [locale]);

  useEffect(() => {
    try {
      setClosed(!a || localStorage.getItem(KEY) === hash(a.text));
    } catch {
      setClosed(!a);
    }
  }, [a]);

  if (!a || closed) return null;
  const close = () => {
    setClosed(true);
    try {
      localStorage.setItem(KEY, hash(a.text));
    } catch {
      /* private mode */
    }
  };
  const body = (
    <>
      <span className="relative flex size-2 shrink-0">
        <span className="absolute inset-0 animate-ping rounded-full bg-cyan/60" />
        <span className="relative size-2 rounded-full bg-cyan" />
      </span>
      <span className="min-w-0 flex-1 text-[0.92rem] leading-snug text-chalk">{a.text}</span>
      {a.url && <Icon name="arrow" size={16} className="shrink-0 text-cyan rtl:-scale-x-100" />}
    </>
  );
  const cls = "flex min-w-0 flex-1 items-center gap-3 py-3 ps-4";
  return (
    <div role="status" className="fixed inset-x-3 bottom-[calc(5.6rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-xl items-center rounded-2xl border border-cyan/30 bg-abyss/95 shadow-[0_18px_50px_-18px_rgb(0_0_0/0.9)] backdrop-blur-xl lg:bottom-6 lg:start-6 lg:end-auto lg:mx-0 lg:w-[30rem]">
      {a.url ? (
        a.url.startsWith("/") ? (
          <Link href={`${localePrefix}${a.url}`} className={cls}>
            {body}
          </Link>
        ) : (
          <a href={a.url} target="_blank" rel="noopener noreferrer" className={cls}>
            {body}
          </a>
        )
      ) : (
        <div className={cls}>{body}</div>
      )}
      <button type="button" onClick={close} aria-label={locale === "ar" ? "إغلاق" : "Close"} className="flex size-11 shrink-0 items-center justify-center text-fog hover:text-chalk">
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}
