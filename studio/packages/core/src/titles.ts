/**
 * Title layout shared by the preview (browser canvas) and the render (the worker's canvas): the same
 * fonts, the same wrapping, the same positions, so the export matches what the editor shows.
 */
import type { TextClip } from "./edl.ts";

/** Fonts shipped with the studio (studio/fonts). The key is what a title stores. */
export const FONTS: Record<string, { family: string; file: string; weights: number[] }> = {
  "Plex Arabic": { family: "StudioPlexArabic", file: "plex-arabic-700.woff2", weights: [700] },
  "Plex Arabic Regular": { family: "StudioPlexArabicRegular", file: "plex-arabic-400.woff2", weights: [400] },
  Kufi: { family: "StudioKufi", file: "kufi-var.woff2", weights: [400, 700, 900] },
  Amiri: { family: "StudioAmiri", file: "amiri-700.woff2", weights: [700] },
  Saira: { family: "StudioSaira", file: "saira-var.woff2", weights: [400, 700, 900] },
  Inter: { family: "StudioInter", file: "inter-var.woff2", weights: [400, 700, 900] },
};
export const DEFAULT_FONT = "Plex Arabic";

export type Measure = { font: string; measureText(t: string): { width: number } };

export type TitleLayout = {
  font: string;
  lines: { text: string; x: number; y: number; width: number }[];
  lineHeight: number;
  box: { x: number; y: number; w: number; h: number } | null;
  rtl: boolean;
};

export const isRtl = (s: string) => /[֐-ࣿיִ-ﻼ]/.test(s);

export function cssFont(c: Pick<TextClip, "font" | "weight" | "size">, height: number): string {
  const f = FONTS[c.font] ?? FONTS[DEFAULT_FONT];
  const px = Math.max(8, Math.round(c.size * height));
  return `${c.weight} ${px}px ${f.family}`;
}

/** Wrap to 88% of the frame width; place the block around the clip's center offset. */
export function layoutTitle(ctx: Measure, c: TextClip, W: number, H: number): TitleLayout {
  const font = cssFont(c, H);
  ctx.font = font;
  const px = Math.max(8, Math.round(c.size * H));
  const maxW = W * 0.88;
  const lines: string[] = [];
  for (const para of c.text.split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = next;
    }
    lines.push(line);
  }
  const lineHeight = Math.round(px * 1.35);
  const blockH = lineHeight * lines.length;
  const cx = W / 2 + c.transform.x * (W / 2);
  const cy = H / 2 + c.transform.y * (H / 2);
  const top = cy - blockH / 2;
  const rtl = isRtl(c.text);
  const widths = lines.map((l) => ctx.measureText(l).width);
  const blockW = Math.max(...widths, 1);
  const out = lines.map((text, i) => {
    const w = widths[i];
    const left = c.align === "center" ? cx - w / 2 : (c.align === "start") !== rtl ? cx - blockW / 2 : cx + blockW / 2 - w;
    return { text, x: left, y: top + lineHeight * i + lineHeight / 2, width: w };
  });
  const pad = px * 0.35;
  const box = c.box ? { x: cx - blockW / 2 - pad, y: top - pad * 0.4, w: blockW + pad * 2, h: blockH + pad * 0.8 } : null;
  return { font, lines: out, lineHeight, box, rtl };
}

type Ctx2D = Measure & {
  fillStyle: string | CanvasGradient | CanvasPattern;
  textBaseline: string;
  textAlign: string;
  direction?: string;
  globalAlpha: number;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(t: string, x: number, y: number): void;
  save(): void;
  restore(): void;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetY: number;
};

/** Draw a title (opacity is the caller's: the preview fades, the render fades in FFmpeg). */
export function drawTitle(ctx: Ctx2D, c: TextClip, W: number, H: number) {
  const L = layoutTitle(ctx, c, W, H);
  ctx.save();
  if (L.box && c.box) {
    ctx.fillStyle = c.box.length === 9 ? `#${c.box.slice(1, 7)}${c.box.slice(7)}` : c.box;
    ctx.fillRect(L.box.x, L.box.y, L.box.w, L.box.h);
  }
  ctx.font = L.font;
  ctx.fillStyle = c.color;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  if ("direction" in ctx) ctx.direction = L.rtl ? "rtl" : "ltr";
  if (L.rtl) ctx.textAlign = "right";
  if (!c.box) {
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = Math.round(c.size * H * 0.25);
    ctx.shadowOffsetY = Math.round(c.size * H * 0.06);
  }
  for (const l of L.lines) ctx.fillText(l.text, L.rtl ? l.x + l.width : l.x, l.y);
  ctx.restore();
}

type CanvasGradient = unknown;
type CanvasPattern = unknown;
