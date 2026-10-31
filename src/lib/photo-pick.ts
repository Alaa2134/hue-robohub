/**
 * Picks the photos worth posting from an event's album, by plain image maths (no AI): drops the
 * blurry, too dark or blown out ones and near-duplicate shots (pickBest), then ranks the rest by how
 * sharp they are and how much of them is people (skin tones), and keeps the first few.
 */
import { pickBest, type Look } from "./photo-frame";

export type Seen = Look & { skin: number };

/** Share of skin-coloured pixels (the classic RGB rule) in a small copy. */
export function skinShare(px: Uint8ClampedArray): number {
  let n = 0,
    all = 0;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i],
      g = px[i + 1],
      b = px[i + 2];
    all++;
    if (r > 95 && g > 40 && b > 20 && r > g && r > b && r - Math.min(g, b) > 15 && Math.abs(r - g) > 15) n++;
  }
  return all ? n / all : 0;
}

/** The best `count` photos, best first (indexes into `seen`; a photo that couldn't be read is skipped). */
export function suggest(seen: (Seen | null)[], count = 4): number[] {
  const verdict = pickBest(seen);
  const ok = seen.map((s, i) => ({ s, i })).filter((x): x is { s: Seen; i: number } => !!x.s && verdict[x.i] === "keep");
  if (!ok.length) return [];
  const maxSharp = Math.max(...ok.map((x) => x.s.sharp)) || 1;
  // People matter most (up to about a third of the frame), then sharpness; well-lit beats dim.
  const score = (s: Seen) => 0.55 * Math.min(1, s.skin / 0.3) + 0.35 * Math.sqrt(s.sharp / maxSharp) + 0.1 * (1 - Math.abs(s.mean - 128) / 128);
  return ok
    .sort((a, b) => score(b.s) - score(a.s) || a.i - b.i)
    .slice(0, count)
    .map((x) => x.i);
}
