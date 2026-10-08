"use client";
/**
 * "Get the app" on the website: the store link for this phone (App Store on iPhone, Google Play
 * elsewhere), both on a computer. The links are the ones the owner sets in the BuildX App
 * (/staff/apps, site setting "apps"), so nothing shows until the app is actually in a store.
 */
import { useEffect, useState } from "react";
import { Icon } from "@/components/brand/icons";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

type Links = { android?: string; ios?: string };
const ok = (u: unknown): u is string => typeof u === "string" && /^https:\/\/\S+$/.test(u);

export function AppDownload({ locale, className }: { locale: string; className?: string }) {
  const [links, setLinks] = useState<Links | null>(null);
  const [os, setOs] = useState<"ios" | "android" | "desktop">("desktop");
  useEffect(() => {
    const ua = navigator.userAgent;
    setOs(/iphone|ipad|ipod/i.test(ua) ? "ios" : /android/i.test(ua) ? "android" : "desktop");
    fetch(`${SUPABASE_URL}/rest/v1/site_settings?select=value&key=eq.apps`, { headers: { apikey: SUPABASE_KEY, Accept: "application/json" } })
      .then((r) => (r.ok ? (r.json() as Promise<{ value: Record<string, unknown> }[]>) : []))
      .then((rows) => {
        const v = rows[0]?.value ?? {};
        setLinks({ android: ok(v.student_android) ? v.student_android : undefined, ios: ok(v.student_ios) ? v.student_ios : undefined });
      })
      .catch(() => setLinks(null));
  }, []);
  if (!links) return null;
  const ar = locale === "ar";
  const shown = os === "ios" ? (["ios"] as const) : os === "android" ? (["android"] as const) : (["ios", "android"] as const);
  const items = shown.filter((k) => links[k]);
  if (!items.length) return null;
  return (
    <div className={className}>
      <p className="t-eyebrow mb-2 text-fog">{ar ? "حمّل التطبيق" : "Get the app"}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((k) => (
          <a key={k} href={links[k]} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
            <span>{k === "ios" ? "App Store" : "Google Play"}</span>
            <Icon name="arrowUpRight" size={14} />
          </a>
        ))}
      </div>
    </div>
  );
}
