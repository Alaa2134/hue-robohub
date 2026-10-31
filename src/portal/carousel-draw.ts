/**
 * Draws the event carousel's slides (1080×1350, Instagram portrait) in the BuildX style: a near-black
 * background with grain, blue brush strokes, photos in white frames with tape, film strips, torn
 * paper, a brush script and hand-written notes. Everything is drawn here (no images from elsewhere
 * but the event's photos and the logo), and the same event always gets the same strokes.
 */
import { BASE_PATH } from "@/lib/deploy";
import { ORDER, seeded, slideWords, splitTitle, type CarouselText, type SlideKey } from "@/lib/carousel";
import { bestCrop, saliency, type Rect } from "@/lib/photo-frame";

export const W = 1080;
export const H = 1350;
const BLUE = "#2563ff";
const INK = "#05070c";
const PAPER = "#f3f3f1";

export type Pic = { el: CanvasImageSource; w: number; h: number; small: { px: Uint8ClampedArray; w: number; h: number; map?: Float32Array } };
type Ctx = CanvasRenderingContext2D;
type Rnd = () => number;

/** Font stacks from the page (next/font names them). */
function fam(v: string, fallback: string) {
  const s = typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue(v).trim() : "";
  return s ? `${s}, ${fallback}` : fallback;
}
const F = {
  bold: () => fam("--font-saira", "Arial Black, sans-serif"),
  script: () => fam("--font-script", "cursive"),
  note: () => fam("--font-note", "cursive"),
  sans: () => fam("--font-inter", "sans-serif"),
  arabic: () => fam("--font-kufi", "Tahoma, sans-serif"),
};
const isArabic = (s: string) => /[؀-ۿ]/.test(s);

/** Make sure the fonts are in before drawing (a canvas doesn't wait for them). */
export async function loadFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  const fonts = [`800 100px ${F.bold()}`, `400 100px ${F.script()}`, `700 40px ${F.note()}`, `600 30px ${F.sans()}`, `800 100px ${F.arabic()}`];
  await Promise.all(fonts.map((f) => document.fonts.load(f, "Aa").catch(() => [])));
  await document.fonts.ready;
  // A canvas can still draw the first text with the fallback: draw each font once, then give it a frame.
  const c = document.createElement("canvas");
  c.width = c.height = 8;
  const x = c.getContext("2d")!;
  for (const f of fonts) {
    x.font = f;
    x.fillText("Aa", 0, 8);
  }
  await new Promise((ok) => setTimeout(ok, 60));
}

let logo: Promise<HTMLImageElement | null> | null = null;
const loadLogo = () =>
  (logo ??= new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = `${BASE_PATH}/brand/logo-horizontal-white.png`;
  }));

/** A photo ready to draw: the element, its size, and a small copy for finding its subject. */
export async function toPic(src: Blob): Promise<Pic> {
  const el = await createImageBitmap(src, { imageOrientation: "from-image" } as ImageBitmapOptions);
  const sw = 96,
    sh = Math.max(8, Math.round((96 * el.height) / el.width));
  const c = document.createElement("canvas");
  c.width = sw;
  c.height = sh;
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.drawImage(el, 0, 0, sw, sh);
  return { el, w: el.width, h: el.height, small: { px: x.getImageData(0, 0, sw, sh).data, w: sw, h: sh } };
}

/** Where to crop a photo for a window of this shape: around what matters in it. */
function cropFor(p: Pic, aspect: number): Rect {
  p.small.map ??= saliency(p.small.px, p.small.w, p.small.h);
  return bestCrop(p.small.map, p.small.w, p.small.h, aspect);
}

function drawCover(ctx: Ctx, p: Pic, x: number, y: number, w: number, h: number) {
  const c = cropFor(p, w / h);
  ctx.drawImage(p.el, c.x * p.w, c.y * p.h, c.w * p.w, c.h * p.h, x, y, w, h);
}

/* ─── Texture ─────────────────────────────────────────────────────────── */

function background(ctx: Ctx, rnd: Rnd) {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W * 0.7, H * 0.25, 50, W * 0.6, H * 0.4, H * 0.9);
  g.addColorStop(0, "rgba(30,60,140,0.20)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  grain(ctx, rnd, 0.05);
}

function grain(ctx: Ctx, rnd: Rnd, alpha: number) {
  ctx.save();
  for (let i = 0; i < 9000; i++) {
    const v = Math.floor(rnd() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rnd()})`;
    ctx.fillRect(rnd() * W, rnd() * H, 1.6, 1.6);
  }
  ctx.restore();
}

/** A dry blue brush stroke across a band. */
function brush(ctx: Ctx, x: number, y: number, w: number, h: number, rnd: Rnd, alpha = 1, color = BLUE) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  for (let i = 0; i < 38; i++) {
    const yy = y + rnd() * h;
    ctx.lineWidth = 3 + rnd() * h * 0.32;
    ctx.globalAlpha = alpha * (0.25 + rnd() * 0.7);
    const x0 = x + rnd() * w * 0.12;
    const x1 = x + w * (0.78 + rnd() * 0.22);
    ctx.beginPath();
    ctx.moveTo(x0, yy);
    ctx.quadraticCurveTo((x0 + x1) / 2, yy + (rnd() - 0.5) * h * 0.35, x1, yy + (rnd() - 0.5) * h * 0.25);
    ctx.stroke();
  }
  // Dry streaks off the end and a few drops.
  for (let i = 0; i < 46; i++) {
    const yy = y + rnd() * h;
    ctx.lineWidth = 0.8 + rnd() * 2.6;
    ctx.globalAlpha = alpha * (0.2 + rnd() * 0.5);
    const x0 = x + w * (0.7 + rnd() * 0.2);
    ctx.beginPath();
    ctx.moveTo(x0, yy);
    ctx.lineTo(x0 + w * (0.1 + rnd() * 0.25), yy + (rnd() - 0.5) * 10);
    ctx.stroke();
  }
  ctx.fillStyle = color;
  for (let i = 0; i < 14; i++) {
    ctx.globalAlpha = alpha * rnd() * 0.8;
    ctx.beginPath();
    ctx.arc(x + w * (0.85 + rnd() * 0.3), y + rnd() * h * 1.4 - h * 0.2, 1 + rnd() * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A strip of torn grey paper across the slide. */
function torn(ctx: Ctx, y: number, h: number, rnd: Rnd) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-20, y);
  for (let x = -20; x <= W + 20; x += 16) ctx.lineTo(x, y + rnd() * 16 - 8 + (x / W) * 18);
  for (let x = W + 20; x >= -20; x -= 16) ctx.lineTo(x, y + h + rnd() * 18 - 9 - (x / W) * 22);
  ctx.closePath();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#c9ccd1";
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.clip();
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.25})`;
    ctx.fillRect(rnd() * W, y - 10 + rnd() * (h + 20), 2, 1);
  }
  ctx.restore();
}

/** A photo darkened and tinted blue, faded into the background (for a slide's backdrop). */
function backdrop(ctx: Ctx, p: Pic, x: number, y: number, w: number, h: number, strength = 0.55) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  drawCover(ctx, p, x, y, w, h);
  ctx.globalCompositeOperation = "color";
  ctx.fillStyle = "#0c2c74";
  ctx.fillRect(x, y, w, h);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = `rgba(3,6,14,${1 - strength})`;
  ctx.fillRect(x, y, w, h);
  const top = ctx.createLinearGradient(0, y, 0, y + h * 0.45);
  top.addColorStop(0, INK);
  top.addColorStop(1, "rgba(5,7,12,0)");
  ctx.fillStyle = top;
  ctx.fillRect(x, y, w, h);
  const bottom = ctx.createLinearGradient(0, y + h * 0.7, 0, y + h);
  bottom.addColorStop(0, "rgba(5,7,12,0)");
  bottom.addColorStop(1, "rgba(5,7,12,0.85)");
  ctx.fillStyle = bottom;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function tape(ctx: Ctx, x: number, y: number, w: number, h: number, rot: number, color = "rgba(235,235,230,0.72)") {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2);
  for (let i = 0; i <= 6; i++) ctx.lineTo(-w / 2 + (i % 2 ? 4 : 0), -h / 2 + (h * i) / 6);
  for (let i = 0; i <= 6; i++) ctx.lineTo(w / 2 - (i % 2 ? 4 : 0), h / 2 - (h * i) / 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** A photo in a white frame, tilted, with a shadow and tape. */
function framed(ctx: Ctx, p: Pic, cx: number, cy: number, w: number, h: number, rot: number, tapes: ("top" | "tl" | "br" | "blue")[] = ["top"]) {
  const b = Math.round(Math.min(w, h) * 0.035) + 6;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.shadowColor = "rgba(0,0,0,0.65)";
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = PAPER;
  ctx.fillRect(-w / 2 - b, -h / 2 - b, w + 2 * b, h + 2 * b);
  ctx.shadowColor = "transparent";
  drawCover(ctx, p, -w / 2, -h / 2, w, h);
  for (const t of tapes) {
    if (t === "top") tape(ctx, 0, -h / 2 - b, 150, 38, -0.03);
    if (t === "blue") tape(ctx, 0, -h / 2 - b, 150, 36, 0.02, "rgba(37,99,255,0.92)");
    if (t === "tl") tape(ctx, -w / 2, -h / 2, 120, 34, -0.75);
    if (t === "br") tape(ctx, w / 2, h / 2, 120, 34, -0.75);
  }
  ctx.restore();
}

/** A photo on a strip of film. */
function film(ctx: Ctx, p: Pic, cx: number, cy: number, w: number, h: number, rot: number) {
  const pad = 46;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 26;
  ctx.fillStyle = "#0b0b0c";
  ctx.fillRect(-w / 2 - 18, -h / 2 - pad, w + 36, h + 2 * pad);
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "#e9e9e6";
  for (let x = -w / 2 - 6; x < w / 2; x += 34) {
    ctx.fillRect(x, -h / 2 - pad + 12, 18, 20);
    ctx.fillRect(x, h / 2 + pad - 32, 18, 20);
  }
  drawCover(ctx, p, -w / 2, -h / 2, w, h);
  tape(ctx, w / 2 - 10, -h / 2 - pad + 4, 110, 32, 0.6);
  ctx.restore();
}

/* ─── Words ───────────────────────────────────────────────────────────── */

/** Set a font, shrinking until the text fits `max` wide. */
function fit(ctx: Ctx, text: string, weight: string, size: number, family: string, max: number) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (ctx.measureText(text).width > max && s > 20) {
    s -= 4;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  return s;
}

function heading(ctx: Ctx, top: string, big: string, x: number, y: number, max = 820) {
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  let yy = y;
  if (top) {
    fit(ctx, top, "800", 104, F.bold(), max);
    ctx.fillText(top, x, yy);
    yy += 16;
  }
  ctx.translate(x, yy);
  ctx.rotate(-0.05);
  const s = fit(ctx, big, "400", 156, F.script(), max);
  ctx.fillStyle = BLUE;
  ctx.fillText(big, 0, s * 0.92);
  ctx.restore();
}

function notes(ctx: Ctx, lines: string[], x: number, y: number, size = 46, rot = -0.07, align: CanvasTextAlign = "left") {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = "#f2f2f2";
  ctx.textAlign = align;
  ctx.font = `700 ${size}px ${F.note()}`;
  lines.forEach((l, i) => ctx.fillText(l, 0, i * size * 1.12));
  ctx.restore();
}

function curlyArrow(ctx: Ctx, x: number, y: number, dx: number, dy: number) {
  ctx.save();
  ctx.strokeStyle = "#f2f2f2";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x + dx * 0.9, y + dy * 0.1, x + dx * 0.2, y + dy * 0.7, x + dx, y + dy);
  ctx.stroke();
  const a = Math.atan2(dy * 0.3, dx * 0.8);
  ctx.beginPath();
  ctx.moveTo(x + dx, y + dy);
  ctx.lineTo(x + dx - 22 * Math.cos(a - 0.5), y + dy - 22 * Math.sin(a - 0.5));
  ctx.moveTo(x + dx, y + dy);
  ctx.lineTo(x + dx - 22 * Math.cos(a + 0.5), y + dy - 22 * Math.sin(a + 0.5));
  ctx.stroke();
  ctx.restore();
}

/* ─── Small line icons ────────────────────────────────────────────────── */

function icon(ctx: Ctx, kind: "pin" | "calendar" | "bulb" | "people" | "gear" | "trophy" | "heart" | "check" | "bus", x: number, y: number, s: number, color = "#ffffff") {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 48, s / 48);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (kind === "pin") {
    ctx.moveTo(24, 46);
    ctx.bezierCurveTo(8, 28, 8, 22, 8, 18);
    ctx.arc(24, 18, 16, Math.PI, 0);
    ctx.bezierCurveTo(40, 22, 40, 28, 24, 46);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(24, 18, 6, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "calendar") {
    ctx.strokeRect(6, 10, 36, 32);
    ctx.moveTo(6, 20);
    ctx.lineTo(42, 20);
    ctx.moveTo(15, 5);
    ctx.lineTo(15, 13);
    ctx.moveTo(33, 5);
    ctx.lineTo(33, 13);
    ctx.stroke();
    for (const [a, b] of [[13, 27], [22, 27], [31, 27], [13, 35], [22, 35]]) ctx.fillRect(a, b, 4, 4);
  } else if (kind === "bulb") {
    ctx.arc(24, 18, 13, Math.PI * 0.8, Math.PI * 2.2);
    ctx.lineTo(30, 34);
    ctx.lineTo(18, 34);
    ctx.closePath();
    ctx.moveTo(18, 39);
    ctx.lineTo(30, 39);
    ctx.moveTo(20, 44);
    ctx.lineTo(28, 44);
    ctx.stroke();
  } else if (kind === "people") {
    for (const [cx, r] of [[24, 7], [10, 5.5], [38, 5.5]] as const) {
      ctx.moveTo(cx + r, 14);
      ctx.arc(cx, 14, r, 0, Math.PI * 2);
    }
    ctx.moveTo(12, 42);
    ctx.quadraticCurveTo(24, 18, 36, 42);
    ctx.moveTo(1, 38);
    ctx.quadraticCurveTo(10, 22, 18, 32);
    ctx.moveTo(30, 32);
    ctx.quadraticCurveTo(38, 22, 47, 38);
    ctx.stroke();
  } else if (kind === "gear") {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.moveTo(24 + Math.cos(a) * 15, 24 + Math.sin(a) * 15);
      ctx.lineTo(24 + Math.cos(a) * 21, 24 + Math.sin(a) * 21);
    }
    ctx.moveTo(39, 24);
    ctx.arc(24, 24, 15, 0, Math.PI * 2);
    ctx.moveTo(31, 24);
    ctx.arc(24, 24, 7, 0, Math.PI * 2);
    ctx.stroke();
  } else if (kind === "trophy") {
    ctx.moveTo(14, 6);
    ctx.lineTo(34, 6);
    ctx.lineTo(32, 22);
    ctx.quadraticCurveTo(24, 32, 16, 22);
    ctx.closePath();
    ctx.moveTo(14, 10);
    ctx.quadraticCurveTo(4, 10, 8, 18);
    ctx.quadraticCurveTo(10, 22, 16, 22);
    ctx.moveTo(34, 10);
    ctx.quadraticCurveTo(44, 10, 40, 18);
    ctx.quadraticCurveTo(38, 22, 32, 22);
    ctx.moveTo(24, 29);
    ctx.lineTo(24, 38);
    ctx.moveTo(15, 42);
    ctx.lineTo(33, 42);
    ctx.lineTo(31, 38);
    ctx.lineTo(17, 38);
    ctx.closePath();
    ctx.stroke();
  } else if (kind === "heart") {
    ctx.moveTo(24, 42);
    ctx.bezierCurveTo(4, 28, 4, 10, 16, 10);
    ctx.bezierCurveTo(21, 10, 24, 15, 24, 15);
    ctx.bezierCurveTo(24, 15, 27, 10, 32, 10);
    ctx.bezierCurveTo(44, 10, 44, 28, 24, 42);
    ctx.stroke();
  } else if (kind === "check") {
    ctx.lineWidth = 5;
    ctx.moveTo(6, 26);
    ctx.lineTo(18, 38);
    ctx.lineTo(42, 10);
    ctx.stroke();
  } else if (kind === "bus") {
    ctx.strokeRect(2, 10, 44, 26);
    ctx.moveTo(2, 18);
    ctx.lineTo(46, 18);
    for (const x of [8, 18, 28, 38]) ctx.strokeRect(x, 12, 6, 5);
    ctx.moveTo(18, 40);
    ctx.arc(13, 38, 4, 0, Math.PI * 2);
    ctx.moveTo(40, 38);
    ctx.arc(35, 38, 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function placeDate(ctx: Ctx, t: CarouselText, y: number, center = false) {
  ctx.save();
  ctx.font = `600 30px ${isArabic(t.place) ? F.arabic() : F.sans()}`;
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  const parts: ["pin" | "calendar", string][] = [];
  if (t.place) parts.push(["pin", t.place]);
  if (t.date) parts.push(["calendar", t.date]);
  const widths = parts.map(([, s]) => 52 + ctx.measureText(s).width);
  const gap = 90;
  let x = center ? (W - widths.reduce((a, b) => a + b, 0) - gap * (parts.length - 1)) / 2 : 80;
  parts.forEach(([k, s], i) => {
    icon(ctx, k, x, y - 20, 40, k === "pin" ? BLUE : "#9cb8ff");
    ctx.fillText(s, x + 52, y);
    x += widths[i] + gap;
  });
  ctx.restore();
}

function drawLogo(ctx: Ctx, img: HTMLImageElement | null, x: number, y: number, h: number) {
  if (!img) return;
  const w = (img.naturalWidth / img.naturalHeight) * h;
  ctx.drawImage(img, x, y, w, h);
}

/* ─── The slides ──────────────────────────────────────────────────────── */

export type Slides = Partial<Record<SlideKey, Pic[]>>;

/** Every slide that has its photos (cover and thanks always), as JPEG blobs in order. */
export async function renderCarousel(t: CarouselText, pics: Slides, seed: string): Promise<{ key: SlideKey; blob: Blob }[]> {
  await loadFonts();
  const img = await loadLogo();
  const words = slideWords(t);
  const out: { key: SlideKey; blob: Blob }[] = [];
  for (const key of ORDER) {
    const p = pics[key] ?? [];
    if (key !== "cover" && key !== "thanks" && !p.length) continue;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    const rnd = seeded(`${seed}:${key}`);
    background(ctx, rnd);
    const w = words[key];
    DRAW[key](ctx, { p, w, t, rnd, logo: img, all: pics });
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.9));
    c.width = c.height = 0;
    if (blob) out.push({ key, blob });
  }
  return out;
}

type Args = { p: Pic[]; w: ReturnType<typeof slideWords>[SlideKey]; t: CarouselText; rnd: Rnd; logo: HTMLImageElement | null; all: Slides };

const DRAW: Record<SlideKey, (ctx: Ctx, a: Args) => void> = {
  cover(ctx, { p, w, t, rnd, logo }) {
    if (p[0]) backdrop(ctx, p[0], 0, 760, W, H - 760, 0.95);
    brush(ctx, W - 380, 0, 420, 110, rnd, 0.9);
    brush(ctx, -40, 1160, 520, 70, rnd, 0.7);
    drawLogo(ctx, logo, 80, 80, 74);
    // The event's name, big; the last line in blue.
    const lines = splitTitle(t.title.toUpperCase().replace(/\s+/g, " "), 3, 13);
    const arabic = isArabic(t.title);
    let y = 330;
    ctx.save();
    ctx.textAlign = arabic ? "right" : "left";
    lines.forEach((l, i) => {
      const s = fit(ctx, l, "800", 150, arabic ? F.arabic() : F.bold(), W - 160);
      ctx.fillStyle = i === lines.length - 1 && lines.length > 1 ? BLUE : "#ffffff";
      y += s * (i ? 1.02 : 0.9);
      ctx.fillText(l, arabic ? W - 80 : 80, y);
    });
    ctx.restore();
    // The brush line, with a stroke under it.
    ctx.save();
    ctx.translate(90, y + 150);
    ctx.rotate(-0.06);
    const s = fit(ctx, w.notes[0], "400", 132, F.script(), W - 220);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(w.notes[0], 0, 0);
    ctx.restore();
    brush(ctx, 80, y + 160, Math.min(W - 200, s * w.notes[0].length * 0.42 + 120), 22, rnd, 0.95);
    placeDate(ctx, t, H - 70);
  },

  arrival(ctx, { p, w, rnd, t }) {
    if (p[0]) backdrop(ctx, p[0], 0, 420, W, 520, 0.35);
    brush(ctx, -60, 1040, 560, 120, rnd, 0.85);
    brush(ctx, W - 300, 720, 360, 80, rnd, 0.6);
    heading(ctx, w.top, w.big, 80, 190, 600);
    notes(ctx, w.notes, 700, 130, 48, -0.08);
    curlyArrow(ctx, 860, 300, -30, 110);
    framed(ctx, p[0], 640, 620, 560, 400, 0.05, ["top"]);
    framed(ctx, p[1], 360, 960, 500, 350, -0.04, ["tl", "br"]);
    notes(ctx, w.foot ?? [], 560, 1200, 46, -0.06);
    if (t.from) icon(ctx, "bus", 800, 1080, 110);
  },

  highlights(ctx, { p, w, rnd }) {
    brush(ctx, -40, 1060, 420, 90, rnd, 0.55);
    heading(ctx, w.top, w.big, 70, 150, 760);
    icon(ctx, "gear", 900, 110, 110);
    framed(ctx, p[0], W / 2, 560, 900, 470, -0.015, ["blue"]);
    framed(ctx, p[1], 300, 950, 400, 290, 0.03, ["tl"]);
    framed(ctx, p[2], 780, 960, 400, 290, -0.03, ["br"]);
    ctx.save();
    w.notes.forEach((l, i) => {
      icon(ctx, "check", 80, 1142 + i * 48, 34, BLUE);
    });
    ctx.restore();
    notes(ctx, w.notes, 128, 1172, 42, -0.03);
  },

  action(ctx, { p, w, rnd }) {
    if (p[0]) backdrop(ctx, p[0], 300, 900, W - 300, 450, 0.3);
    torn(ctx, 0, 70, rnd);
    brush(ctx, 600, 260, 300, 110, rnd, 0.8);
    heading(ctx, w.top, w.big, 70, 200, 720);
    notes(ctx, w.notes, 880, 180, 48, -0.06);
    framed(ctx, p[0], 460, 700, 620, 520, -0.05, ["top"]);
    framed(ctx, p[1], 800, 1060, 420, 360, 0.06, ["blue"]);
    curlyArrow(ctx, 830, 330, -90, 110);
  },

  team(ctx, { p, w, rnd, logo }) {
    torn(ctx, 330, 80, rnd);
    heading(ctx, w.top, w.big, 70, 170, 600);
    drawLogo(ctx, logo, W - 330, 90, 64);
    // The label on a brush stroke.
    brush(ctx, 70, 450, 420, 80, rnd, 0.95);
    ctx.save();
    ctx.translate(110, 505);
    ctx.rotate(-0.04);
    ctx.font = `700 54px ${F.note()}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(w.notes[0], 0, 0);
    ctx.restore();
    const cols = 3;
    const rows = Math.ceil(p.length / cols);
    const cw = 270,
      ch = 290,
      gx = 40,
      gy = 40;
    const x0 = (W - (cols * cw + (cols - 1) * gx)) / 2;
    p.forEach((pic, i) => {
      const r = Math.floor(i / cols),
        c = i % cols;
      framed(ctx, pic, x0 + c * (cw + gx) + cw / 2, 600 + r * (ch + gy) + ch / 2, cw - 20, ch - 20, (rnd() - 0.5) * 0.06, []);
    });
    notes(ctx, w.foot ?? [], 560, 660 + rows * (ch + gy), 46, -0.06);
    icon(ctx, "heart", 900, 690 + rows * (ch + gy) + 40, 60, BLUE);
  },

  behind(ctx, { p, w, rnd }) {
    torn(ctx, 300, 70, rnd);
    heading(ctx, w.top, w.big, 70, 160, 760);
    film(ctx, p[0], 450, 660, 700, 430, -0.04);
    film(ctx, p[1], 290, 1100, 400, 260, -0.06);
    film(ctx, p[2], 780, 1110, 400, 260, 0.06);
    notes(ctx, w.notes, 880, 440, 40, -0.05);
    brush(ctx, 820, 760, 280, 60, rnd, 0.6);
  },

  family(ctx, { p, w, rnd, logo }) {
    if (p[0]) backdrop(ctx, p[0], 0, 900, W, H - 900, 0.6);
    heading(ctx, w.top, w.big, 70, 180, 620);
    drawLogo(ctx, logo, W - 330, 100, 64);
    framed(ctx, p[0], 460, 640, 720, 520, -0.03, ["blue"]);
    icon(ctx, "people", 880, 460, 110);
    notes(ctx, w.notes, 980, 640, 44, -0.04, "right");
    icon(ctx, "heart", 900, 760, 54);
    notes(ctx, w.foot ?? [], W - 80, 1220, 48, -0.06, "right");
    brush(ctx, -40, 960, 300, 70, rnd, 0.5);
  },

  thanks(ctx, { w, t, rnd, logo, all }) {
    const cover = all.family?.[0] ?? all.cover?.[0];
    if (cover) backdrop(ctx, cover, 0, 0, W, 360, 0.18);
    brush(ctx, -60, 60, 380, 90, rnd, 0.8);
    brush(ctx, W - 320, H - 200, 380, 90, rnd, 0.7);
    drawLogo(ctx, logo, 90, 240, 74);
    ctx.save();
    ctx.translate(W / 2, 560);
    ctx.rotate(-0.05);
    ctx.textAlign = "center";
    fit(ctx, w.top, "400", 190, F.script(), W - 260);
    const tw = ctx.measureText(w.top).width;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(w.top, 0, 0);
    ctx.restore();
    icon(ctx, "heart", Math.min(W - 90, W / 2 + tw / 2 + 6), 450, 70, BLUE);
    brush(ctx, 220, 600, 640, 22, rnd, 0.95);
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    fit(ctx, w.big, "800", 40, F.bold(), W - 200);
    ctx.fillText(w.big, W / 2, 720);
    const kinds = ["bulb", "people", "gear", "trophy"] as const;
    ctx.font = `600 28px ${F.sans()}`;
    w.notes.forEach((n, i) => {
      const cx = 170 + i * 247;
      icon(ctx, kinds[i], cx - 36, 800, 72);
      const [a, b] = n.split(" ");
      ctx.fillText(a, cx, 920);
      if (b) ctx.fillText(b, cx, 956);
    });
    ctx.restore();
    placeDate(ctx, t, 1120, true);
    icon(ctx, "gear", W - 200, H - 190, 150, "#1e2533");
    icon(ctx, "gear", -40, H - 170, 170, "#1e2533");
  },
};

/* ─── Before the event: «coming soon» ─────────────────────────────────── */

export type SoonText = { title: string; kind: string; date: string; day: string; month: string; place: string; days: number; url: string };

async function qrImage(url: string): Promise<HTMLImageElement | null> {
  try {
    const QR = (await import("qrcode")).default;
    const src = await QR.toDataURL(url, { margin: 1, width: 560, errorCorrectionLevel: "M", color: { dark: "#05070c", light: "#ffffff" } });
    return await new Promise((ok) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => ok(null);
      img.src = src;
    });
  } catch {
    return null;
  }
}

/** Three slides before an event: the countdown, save the date, and register (with the QR). */
export async function renderSoon(t: SoonText, seed: string, bg?: Pic): Promise<{ key: string; blob: Blob }[]> {
  await loadFonts();
  const logo = await loadLogo();
  const qr = t.url ? await qrImage(t.url) : null;
  const arabic = isArabic(t.title);
  const draws: [string, (ctx: Ctx, rnd: Rnd) => void][] = [
    [
      "soon",
      (ctx, rnd) => {
        if (bg) backdrop(ctx, bg, 0, 700, W, H - 700, 0.7);
        brush(ctx, W - 400, 0, 440, 110, rnd, 0.9);
        drawLogo(ctx, logo, 80, 80, 70);
        ctx.save();
        ctx.translate(80, 330);
        ctx.rotate(-0.05);
        const s = fit(ctx, "Coming Soon", "400", 170, F.script(), W - 160);
        ctx.fillStyle = BLUE;
        ctx.fillText("Coming Soon", 0, 0);
        ctx.restore();
        brush(ctx, 70, 350, Math.min(W - 140, s * 5.2), 22, rnd, 0.95);
        const lines = splitTitle(arabic ? t.title : t.title.toUpperCase(), 3, 13);
        let y = 450;
        ctx.save();
        ctx.textAlign = arabic ? "right" : "left";
        lines.forEach((l) => {
          const z = fit(ctx, l, "800", 120, arabic ? F.arabic() : F.bold(), W - 160);
          ctx.fillStyle = "#ffffff";
          y += z * 1.05;
          ctx.fillText(l, arabic ? W - 80 : 80, y);
        });
        ctx.restore();
        if (t.days > 0) {
          ctx.save();
          ctx.fillStyle = BLUE;
          ctx.fillRect(80, y + 60, 420, 150);
          ctx.fillStyle = "#ffffff";
          ctx.textBaseline = "middle";
          ctx.font = `800 110px ${F.bold()}`;
          ctx.fillText(String(t.days), 110, y + 140);
          const nw = ctx.measureText(String(t.days)).width;
          ctx.font = `700 46px ${F.note()}`;
          ctx.fillText(t.days === 1 ? "day to go!" : "days to go!", 130 + nw, y + 140);
          ctx.restore();
        }
        placeDate(ctx, { title: t.title, tagline: "", place: t.place, date: t.date, kind: "event", from: "" }, H - 70);
      },
    ],
    [
      "date",
      (ctx, rnd) => {
        brush(ctx, -60, 140, 520, 100, rnd, 0.85);
        heading(ctx, "SAVE", "THE DATE", 80, 200, 760);
        // A calendar page.
        ctx.save();
        ctx.translate(W / 2, 780);
        ctx.rotate(-0.04);
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = 40;
        ctx.fillStyle = PAPER;
        ctx.fillRect(-300, -280, 600, 560);
        ctx.shadowColor = "transparent";
        ctx.fillStyle = BLUE;
        ctx.fillRect(-300, -280, 600, 130);
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        fit(ctx, t.month.toUpperCase(), "800", 70, F.bold(), 540);
        ctx.fillText(t.month.toUpperCase(), 0, -215);
        ctx.fillStyle = INK;
        ctx.font = `800 300px ${F.bold()}`;
        ctx.fillText(t.day, 0, 40);
        ctx.restore();
        tape(ctx, W / 2, 500, 170, 40, 0.03);
        notes(ctx, [t.place ? `📍 ${t.place}` : "", t.kind].filter(Boolean), W / 2, 1190, 50, -0.03, "center");
      },
    ],
    [
      "register",
      (ctx, rnd) => {
        if (bg) backdrop(ctx, bg, 0, 0, W, 420, 0.3);
        heading(ctx, "REGISTER", "NOW", 80, 200, 760);
        brush(ctx, W - 360, 300, 400, 90, rnd, 0.8);
        if (qr) {
          ctx.save();
          ctx.translate(W / 2, 760);
          ctx.rotate(0.03);
          ctx.shadowColor = "rgba(0,0,0,0.6)";
          ctx.shadowBlur = 30;
          ctx.fillStyle = PAPER;
          ctx.fillRect(-300, -300, 600, 600);
          ctx.shadowColor = "transparent";
          ctx.drawImage(qr, -260, -260, 520, 520);
          ctx.restore();
          tape(ctx, W / 2 - 250, 470, 140, 36, -0.6);
          tape(ctx, W / 2 + 250, 1050, 140, 36, -0.6);
        }
        notes(ctx, ["Scan to register"], W / 2, 1170, 56, -0.03, "center");
        ctx.save();
        ctx.font = `600 30px ${F.sans()}`;
        ctx.fillStyle = "#9cb8ff";
        ctx.textAlign = "center";
        ctx.fillText(t.url.replace(/^https?:\/\//, ""), W / 2, H - 60);
        ctx.restore();
      },
    ],
  ];
  const out: { key: string; blob: Blob }[] = [];
  for (const [key, draw] of draws) {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    const rnd = seeded(`${seed}:${key}`);
    background(ctx, rnd);
    draw(ctx, rnd);
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.9));
    c.width = c.height = 0;
    if (blob) out.push({ key, blob });
  }
  return out;
}
