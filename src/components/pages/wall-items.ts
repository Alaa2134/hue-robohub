import { artSrcSet, artUrl, type LibraryEntry } from "@/lib/media-library";
import type { PublicImage } from "@/lib/types";
import type { WallImage } from "./lightbox";

export function fromArt(e: LibraryEntry, caption: string, tag: string): WallImage {
  return { id: e.name, src: artUrl(e, 1920), srcSet: artSrcSet(e, "webp"), thumb: artUrl(e, 768), alt: e.alt, caption, tag, w: e.width, h: e.height, placeholder: e.placeholder };
}

export function fromImage(id: string, img: PublicImage, caption: string, tag: string): WallImage {
  return { id, src: img.src, srcSet: img.webp, thumb: img.src, alt: img.alt || caption, caption, tag, w: img.width, h: img.height, placeholder: img.placeholder };
}
