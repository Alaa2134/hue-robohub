import type { PublicImage } from "@/lib/types";
import data from "./expo-photos.json";

/**
 * Real photos for the Robotex visit page, cut from the organisers' brochure (NDTX & Robotex 2026,
 * in public/media/robotex with the brochure itself): the cover's robots and inspection scenes, the
 * areas of the expo, and photos from the previous NDTX editions.
 */
type Entry = { width: number; height: number; alt_ar: string; alt_en: string; placeholder: string; color: string; sources: Record<"webp" | "avif", { w: number; url: string }[]> };
const PHOTOS = data as Record<string, Entry>;

export const EXPO_BROCHURE = "/media/robotex/robotex-ndtx-2026-brochure-ar.pdf";
export const EXPO_OG = "/media/robotex/og.jpg";
export const PAST_PHOTOS = Object.keys(PHOTOS).filter((k) => k.startsWith("past-"));

export function expoPhoto(name: string, locale: string): PublicImage | null {
  const e = PHOTOS[name];
  if (!e) return null;
  const set = (f: "webp" | "avif") => e.sources[f].map((s) => `${s.url} ${s.w}w`).join(", ");
  return { src: e.sources.webp.at(-1)!.url, webp: set("webp"), avif: set("avif"), width: e.width, height: e.height, placeholder: e.placeholder, color: e.color, alt: locale === "ar" ? e.alt_ar : e.alt_en };
}
