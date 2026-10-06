import "server-only";
import type { ImageVariant } from "../db/schema";
import { storage } from "../storage";
import type { PublicImage } from "@/lib/types";

type AssetLike = {
  variants: ImageVariant[];
  width: number | null;
  height: number | null;
  placeholder: string | null;
  dominantColor: string | null;
  alt: string | null;
  visibility: "public" | "private";
};

/** Build a responsive image descriptor for a public asset. Private assets never get public URLs. */
export function presentImage(asset: AssetLike | null | undefined, alt = ""): PublicImage | null {
  if (!asset || asset.visibility !== "public" || !asset.variants?.length) return null;
  const s = storage();
  const set = (fmt: string) =>
    asset.variants
      .filter((v) => v.format === fmt)
      .map((v) => `${s.publicUrl(v.key)} ${v.w}w`)
      .join(", ");
  const webps = asset.variants.filter((v) => v.format === "webp");
  const fallback = webps.find((v) => v.w >= 960) ?? webps[webps.length - 1] ?? asset.variants[0]!;
  return {
    src: s.publicUrl(fallback.key),
    avif: set("avif"),
    webp: set("webp"),
    width: asset.width ?? fallback.w,
    height: asset.height ?? fallback.h,
    placeholder: asset.placeholder,
    color: asset.dominantColor,
    alt: asset.alt || alt,
  };
}

export function ogImageUrl(asset: AssetLike | null | undefined): string | null {
  if (!asset || asset.visibility !== "public") return null;
  const jpg = asset.variants.find((v) => v.format === "jpeg");
  return jpg ? storage().publicUrl(jpg.key) : null;
}

/** Smallest public WebP rendition at least `minW` wide — for admin thumbnails. */
export function thumbUrl(asset: AssetLike | null | undefined, minW = 480): string | null {
  if (!asset || asset.visibility !== "public" || !asset.variants?.length) return null;
  const webps = asset.variants.filter((v) => v.format === "webp").sort((a, b) => a.w - b.w);
  const v = webps.find((x) => x.w >= minW) ?? webps[webps.length - 1] ?? asset.variants[0]!;
  return storage().publicUrl(v.key);
}
