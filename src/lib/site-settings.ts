/**
 * Website settings the owner edits in the BuildX App (site_settings, key "site"): contact details,
 * social links, the hero text and photo, an announcement and the yearly goals. The static build merges
 * them over the defaults in site-config; anything left empty keeps its default.
 */
import type { LibraryEntry } from "./media-library";
import type { SiteConfig } from "./site-config";
import { siteImageUrl } from "./site-content";

export type GoalSetting = { value: string; label_en: string; label_ar: string; note_en: string; note_ar: string };
export type SiteSettings = {
  contact?: { email?: string; phone?: string; whatsapp?: string; address_en?: string; address_ar?: string; map_url?: string };
  socials?: { facebook?: string; instagram?: string; linkedin?: string; youtube?: string; github?: string };
  hero?: { eyebrow_en?: string; eyebrow_ar?: string; subtitle_en?: string; subtitle_ar?: string; image?: { path: string; width: number; height: number } | null };
  announcement?: { on?: boolean; text_en?: string; text_ar?: string; url?: string };
  goals?: GoalSetting[];
};

const t = (v: string | undefined | null) => (typeof v === "string" ? v.trim() : "");
const safeUrl = (u: string | undefined) => (u && /^https:\/\/[^\s]+$/i.test(u.trim()) ? u.trim() : "");

/** Owner's settings over the built-in defaults (empty fields keep the default). */
export function applySettings(config: SiteConfig, s: SiteSettings | null | undefined): SiteConfig {
  if (!s) return config;
  const c = s.contact ?? {};
  const contact = config["site.contact"];
  if (t(c.email)) contact.email = t(c.email);
  if (t(c.phone)) contact.phone = t(c.phone);
  if (t(c.whatsapp)) contact.whatsapp = t(c.whatsapp).replace(/[^0-9]/g, "");
  if (t(c.address_en)) contact.address = { ...contact.address, en: t(c.address_en) };
  if (t(c.address_ar)) contact.address = { ...contact.address, ar: t(c.address_ar) };
  if (safeUrl(c.map_url)) contact.mapUrl = safeUrl(c.map_url);

  const socials = config["site.socials"];
  for (const k of Object.keys(socials) as (keyof typeof socials)[]) {
    const v = s.socials?.[k];
    if (v !== undefined) socials[k] = safeUrl(v);
  }

  const h = s.hero ?? {};
  const hero = config["site.hero"];
  if (t(h.eyebrow_en) || t(h.eyebrow_ar)) hero.eyebrow = { en: t(h.eyebrow_en) || hero.eyebrow.en, ar: t(h.eyebrow_ar) || hero.eyebrow.ar };
  if (t(h.subtitle_en) || t(h.subtitle_ar)) hero.subtitle = { en: t(h.subtitle_en) || hero.subtitle.en, ar: t(h.subtitle_ar) || hero.subtitle.ar };
  return config;
}

export const announcementOf = (s: SiteSettings | null | undefined, locale: string) => {
  const a = s?.announcement;
  if (!a?.on) return null;
  const text = (locale === "ar" ? t(a.text_ar) || t(a.text_en) : t(a.text_en) || t(a.text_ar)).slice(0, 220);
  return text ? { text, url: safeUrl(a.url) || (a.url && /^\/(?![\/\\])/.test(a.url) ? a.url : "") } : null;
};

export const goalsOf = (s: SiteSettings | null | undefined) => (s?.goals ?? []).filter((g) => t(g.value) && (t(g.label_en) || t(g.label_ar))).slice(0, 8);

/** The owner's hero photo shaped like a library entry, so the hero keeps its layout and srcset. */
export function heroImageOf(s: SiteSettings | null | undefined): LibraryEntry | null {
  const img = s?.hero?.image;
  if (!img?.path || !img.width || !img.height) return null;
  const tw = Math.round(img.width * Math.min(1, 640 / Math.max(img.width, img.height)));
  const webp = [
    ...(tw < img.width && /\.w\.(webp|jpg)$/.test(img.path) ? [{ w: tw, url: siteImageUrl(img.path, "thumb"), bytes: 0 }] : []),
    { w: img.width, url: siteImageUrl(img.path), bytes: 0 },
  ];
  return { name: "hero-custom", alt: "BuildX HUE", width: img.width, height: img.height, focal: [50, 45], category: "hero", placeholder: "", color: "#050e26", og: siteImageUrl(img.path), sources: { avif: [], webp } };
}
