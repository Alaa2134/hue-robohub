import manifest from "@/content/media-library.json";

/** Rendered key-art library (art/render → post.mjs). Entries appear as renders land; callers pass fallbacks. */
export type LibrarySource = { w: number; url: string; bytes: number };
export type LibraryEntry = {
  name: string;
  alt: string;
  width: number;
  height: number;
  focal: [number, number];
  category: string;
  placeholder: string;
  color: string;
  og: string;
  sources: { avif: LibrarySource[]; webp: LibrarySource[] };
};

const LIB = manifest as unknown as Record<string, LibraryEntry>;

/** First available entry among the given names (renders may still be in the queue). */
export function art(...names: string[]): LibraryEntry | null {
  for (const n of names) if (LIB[n]) return LIB[n];
  return null;
}

export function artSrcSet(e: LibraryEntry, fmt: "avif" | "webp") {
  return e.sources[fmt].map((s) => `${s.url} ${s.w}w`).join(", ");
}

/** A mid-size WebP, for poster frames, OG fallbacks and CSS backgrounds. */
export function artUrl(e: LibraryEntry, minWidth = 1080) {
  const list = e.sources.webp;
  return (list.find((s) => s.w >= minWidth) ?? list[list.length - 1])!.url;
}
