/**
 * Title layout shared by the preview (browser canvas) and the render (the worker's canvas): the same
 * fonts, the same wrapping, the same positions, so the export matches what the editor shows. Styles
 * are motion-graphics templates: plain (shadowed text), box, lower third (accent bar + name + role),
 * headline (big text with an accent underline), caption (a bar across the frame).
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

type Line = { text: string; x: number; y: number; width: number; font: string; color: string };
type Rect = { x: number; y: number; w: number; h: number; color: string };

export type TitleLayout = { lines: Line[]; rects: Rect[]; rtl: boolean; shadow: boolean };

export const isRtl = (s: string) => /[֐-ࣿיִ-ﻼ]/.test(s);

export function cssFont(c: Pick<TextClip, "font" | "weight" | "size">, height: number, scale = 1, weight?: number): string {
  const f = FONTS[c.font] ?? FONTS[DEFAULT_FONT];
  const px = Math.max(8, Math.round(c.size * height * scale));
  // Latin letters missing from an Arabic font fall back to Inter (not the system serif).
  return `${weight ?? c.weight} ${px}px ${f.family}, StudioInter`;
}

function wrap(ctx: Measure, text: string, maxW: number): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
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
  return lines;
}

/** Where everything of a title goes: the block is centered on the clip's position offset. */
export function layoutTitle(ctx: Measure, c: TextClip, W: number, H: number): TitleLayout {
  const style = c.style ?? "plain";
  const px = Math.max(8, Math.round(c.size * H));
  const rtl = isRtl(c.text);
  const caption = style === "caption";
  const maxW = W * (caption ? 0.84 : style === "lower-third" ? 0.7 : 0.88);
  const mainFont = cssFont(c, H, style === "headline" ? 1.25 : 1);
  const subFont = cssFont(c, H, 0.58, 500);
  ctx.font = mainFont;
  const main = wrap(ctx, c.text, maxW);
  const mainW = main.map((l) => ctx.measureText(l).width);
  const mainLH = Math.round(px * (style === "headline" ? 1.25 * 1.3 : 1.35));
  ctx.font = subFont;
  const sub = c.subtitle ? wrap(ctx, c.subtitle, maxW) : [];
  const subW = sub.map((l) => ctx.measureText(l).width);
  const subLH = Math.round(px * 0.58 * 1.4);
  const gap = sub.length ? Math.round(px * (style === "headline" ? 0.55 : 0.25)) : 0;
  const blockW = Math.max(1, ...mainW, ...subW);
  const blockH = main.length * mainLH + gap + sub.length * subLH;
  const cx = W / 2 + c.transform.x * (W / 2);
  const cy = H / 2 + c.transform.y * (H / 2);
  const top = cy - blockH / 2;
  // Lower thirds hug their reading side; everything else follows the align setting.
  const align = style === "lower-third" ? "start" : caption ? "center" : c.align;
  const place = (w: number) => (align === "center" ? cx - w / 2 : (align === "start") !== rtl ? cx - blockW / 2 : cx + blockW / 2 - w);
  const lines: Line[] = [
    ...main.map((text, i) => ({ text, x: place(mainW[i]), y: top + mainLH * i + mainLH / 2, width: mainW[i], font: mainFont, color: c.color })),
    ...sub.map((text, i) => ({ text, x: place(subW[i]), y: top + main.length * mainLH + gap + subLH * i + subLH / 2, width: subW[i], font: subFont, color: `${c.color}cc` })),
  ];
  const rects: Rect[] = [];
  const pad = px * 0.45;
  if (style === "box" || (style === "plain" && c.box)) {
    rects.push({ x: cx - blockW / 2 - pad, y: top - pad * 0.5, w: blockW + pad * 2, h: blockH + pad, color: c.box ?? "#000000aa" });
  } else if (style === "lower-third") {
    const bar = Math.max(4, Math.round(H * 0.008));
    const bx = cx - blockW / 2 - pad;
    rects.push({ x: bx, y: top - pad * 0.5, w: blockW + pad * 2, h: blockH + pad, color: c.box ?? "#0b0d12d9" });
    // The accent bar on the reading side.
    rects.push({ x: rtl ? bx + blockW + pad * 2 : bx - bar, y: top - pad * 0.5, w: bar, h: blockH + pad, color: c.accent });
  } else if (style === "headline") {
    const uw = Math.max(blockW * 0.35, px * 2);
    const uh = Math.max(4, Math.round(H * 0.007));
    const uy = top + main.length * mainLH + Math.max(2, gap / 2 - uh / 2);
    rects.push({ x: align === "center" ? cx - uw / 2 : (align === "start") !== rtl ? cx - blockW / 2 : cx + blockW / 2 - uw, y: uy, w: uw, h: uh, color: c.accent });
  } else if (caption) {
    rects.push({ x: W * 0.04, y: top - pad * 0.6, w: W * 0.92, h: blockH + pad * 1.2, color: c.box ?? "#000000a6" });
  }
  return { lines, rects, rtl, shadow: style === "plain" && !c.box };
}

type Ctx2D = Measure & {
  fillStyle: unknown;
  textBaseline: string;
  textAlign: string;
  direction?: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(t: string, x: number, y: number): void;
  save(): void;
  restore(): void;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetY: number;
};

/** Draw a title (opacity and in/out motion are the caller's: the preview animates, FFmpeg animates the render). */
export function drawTitle(ctx: Ctx2D, c: TextClip, W: number, H: number) {
  const L = layoutTitle(ctx, c, W, H);
  ctx.save();
  for (const r of L.rects) {
    ctx.fillStyle = r.color;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  ctx.textBaseline = "middle";
  if ("direction" in ctx) ctx.direction = L.rtl ? "rtl" : "ltr";
  ctx.textAlign = L.rtl ? "right" : "left";
  if (L.shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = Math.round(c.size * H * 0.25);
    ctx.shadowOffsetY = Math.round(c.size * H * 0.06);
  }
  for (const l of L.lines) {
    ctx.font = l.font;
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, L.rtl ? l.x + l.width : l.x, l.y);
  }
  ctx.restore();
}

/**
 * A title's in/out movement at `local` seconds into it, as an offset in pixels: "rise" comes up from a
 * little below, "slide" comes in from the reading side; both go back out over the fade-out. Eased
 * (cubic). The render uses titleMotionExpr(), the same curve as an FFmpeg expression.
 */
export function titleMotion(c: TextClip, local: number, W: number, H: number): { dx: number; dy: number } {
  if (c.animation === "none") return { dx: 0, dy: 0 };
  const din = Math.max(0.05, c.fadeIn || 0.4);
  const dout = Math.max(0.05, c.fadeOut || 0.4);
  const k = (1 - Math.min(1, local / din)) ** 3 + Math.max(0, (local - (c.duration - dout)) / dout) ** 3;
  if (c.animation === "rise") return { dx: 0, dy: H * 0.05 * k };
  const dir = isRtl(c.text) ? 1 : -1;
  return { dx: dir * W * 0.08 * k, dy: 0 };
}

/** titleMotion() as FFmpeg expressions of t (seconds on the output timeline). */
export function titleMotionExpr(c: TextClip, W: number, H: number): { x: string; y: string } {
  if (c.animation === "none") return { x: "0", y: "0" };
  const din = Math.max(0.05, c.fadeIn || 0.4);
  const dout = Math.max(0.05, c.fadeOut || 0.4);
  const S = c.start;
  const E = c.start + c.duration;
  const k = `(pow(1-min(1,(t-${S})/${din}),3)+pow(max(0,(t-${E - dout})/${dout}),3))`;
  if (c.animation === "rise") return { x: "0", y: `${(H * 0.05).toFixed(2)}*${k}` };
  const dir = isRtl(c.text) ? 1 : -1;
  return { x: `${(dir * W * 0.08).toFixed(2)}*${k}`, y: "0" };
}
