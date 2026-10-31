/** Titles drawn to transparent full-frame PNGs with the studio's fonts (same layout as the preview). */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { drawTitle, FONTS, type TextClip } from "@studio/core";

let loaded = false;
export function loadFonts(dir = path.resolve(import.meta.dirname, "../../../fonts")) {
  if (loaded) return;
  for (const f of Object.values(FONTS)) GlobalFonts.registerFromPath(path.join(dir, f.file), f.family);
  loaded = true;
}

export function renderTitle(c: TextClip, W: number, H: number, file: string) {
  loadFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  // The layer's own opacity and fades are applied by FFmpeg; the PNG is the title at full strength.
  drawTitle(ctx as never, { ...c, transform: { ...c.transform, opacity: 1 } }, W, H);
  writeFileSync(file, canvas.toBuffer("image/png"));
}
