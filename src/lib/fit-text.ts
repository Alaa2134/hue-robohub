import type { CSSProperties } from "react";

/**
 * Display headings are uppercase and wide: a long word ("ENTREPRENEURSHIP") can be wider than a phone.
 * Caps the font size so the longest word fits in `room` (a CSS length), keeping `size` everywhere it
 * already fits. Short titles get no style at all.
 */
export function fitLongestWord(text: string, size: string, room: string): CSSProperties | undefined {
  const longest = Math.max(0, ...text.split(/\s+/).map((w) => w.length));
  if (longest < 10) return undefined;
  // Wide capitals (M, N, W) run ≈0.8em each in the display face at its 118% width.
  return { fontSize: `min(${size}, calc((${room}) / ${(longest * 0.8).toFixed(2)}))` };
}
