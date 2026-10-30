/**
 * Photos in the BuildX frame, decided by plain image maths (no AI): where the interesting part of a
 * photo is (edges and detail, skin tones, a little bias to the middle), whether it fills the frame or
 * sits whole on a blurred copy of itself, and a gentle clean-up (levels, white balance, colour,
 * sharpness). Pure functions on RGBA pixels, so they run the same in the browser and in tests.
 */

/** The frame image (public/brand/photo-frame.webp) and the window inside it where the photo shows. */
export const FRAME = { w: 1672, h: 941, hole: { x: 32, y: 57, w: 1608, h: 837 } } as const;

export type Rect = { x: number; y: number; w: number; h: number };

/** Wider than this (width ÷ height) fills the window with a smart crop; narrower sits whole on a blur. */
export const FILL_FROM = 1.2;
export const fitMode = (w: number, h: number): "fill" | "fit" => (w / h >= FILL_FROM ? "fill" : "fit");

/** How much each pixel of a small copy is worth looking at: detail (edges), skin, and the middle a bit. */
export function saliency(px: Uint8ClampedArray, w: number, h: number): Float32Array {
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const gx = x > 0 && x < w - 1 ? lum[i + 1] - lum[i - 1] : 0;
      const gy = y > 0 && y < h - 1 ? lum[i + w] - lum[i - w] : 0;
      const r = px[i * 4],
        g = px[i * 4 + 1],
        b = px[i * 4 + 2];
      // A classic RGB skin rule: people are usually what a photo is about.
      const skin = r > 95 && g > 40 && b > 20 && r > g && r > b && r - Math.min(g, b) > 15 && Math.abs(r - g) > 15 ? 40 : 0;
      const cx = (x + 0.5) / w - 0.5,
        cy = (y + 0.5) / h - 0.5;
      // +1: a flat photo still has a middle to keep.
      out[i] = (Math.hypot(gx, gy) + skin + 1) * (1 - 0.6 * (cx * cx + cy * cy));
    }
  return out;
}

/**
 * The biggest window of this aspect (width ÷ height) inside a w×h map, slid to where the map adds up
 * most. Returned as fractions of the image (0–1), so it applies to the full-size photo.
 */
export function bestCrop(map: Float32Array, w: number, h: number, aspect: number): Rect {
  const tall = w / h < aspect; // the photo is narrower than the window: crop top/bottom
  const cw = tall ? w : Math.min(w, Math.round(h * aspect));
  const ch = tall ? Math.min(h, Math.round(w / aspect)) : h;
  // Sum per row (or column), then slide the window along that axis.
  const n = tall ? h : w;
  const line = new Float64Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) line[tall ? y : x] += map[y * w + x];
  const span = tall ? ch : cw;
  let sum = 0;
  for (let i = 0; i < span; i++) sum += line[i];
  let best = sum,
    at = 0;
  for (let i = span; i < n; i++) {
    sum += line[i] - line[i - span];
    if (sum > best) [best, at] = [sum, i - span + 1];
  }
  return tall ? { x: 0, y: at / h, w: 1, h: ch / h } : { x: at / w, y: 0, w: cw / w, h: 1 };
}

export type Tone = { lo: number; hi: number; gain: [number, number, number] };

/** Levels and white balance from the pixels: stretch the brightness range a little, neutralise a cast. */
export function measureTone(px: Uint8ClampedArray): Tone {
  const hist = new Uint32Array(256);
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let i = 0; i < px.length; i += 4) {
    hist[Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2])]++;
    r += px[i];
    g += px[i + 1];
    b += px[i + 2];
    n++;
  }
  const at = (q: number) => {
    let c = 0;
    for (let v = 0; v < 256; v++) if ((c += hist[v]) >= q * n) return v;
    return 255;
  };
  let lo = at(0.004),
    hi = at(0.996);
  // Never stretch more than about a third: a dark room should stay a dark room.
  if (hi - lo < 190) {
    const mid = (hi + lo) / 2;
    lo = Math.max(0, Math.round(mid - 95));
    hi = Math.min(255, Math.round(mid + 95));
  }
  const avg = (r + g + b) / 3 || 1;
  const clamp = (v: number) => Math.min(1.08, Math.max(0.92, v));
  return { lo, hi, gain: [clamp(avg / (r || 1)), clamp(avg / (g || 1)), clamp(avg / (b || 1))] };
}

/** Apply levels, white balance and a touch of colour, in place. */
export function applyTone(px: Uint8ClampedArray, t: Tone, saturation = 1.08) {
  const scale = 255 / Math.max(1, t.hi - t.lo);
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = (v - t.lo) * scale;
  for (let i = 0; i < px.length; i += 4) {
    let r = lut[Math.min(255, px[i] * t.gain[0]) | 0],
      g = lut[Math.min(255, px[i + 1] * t.gain[1]) | 0],
      b = lut[Math.min(255, px[i + 2] * t.gain[2]) | 0];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    r = l + (r - l) * saturation;
    g = l + (g - l) * saturation;
    b = l + (b - l) * saturation;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  }
}

/** Unsharp mask (3×3), in place: crisper after the photo was scaled down. */
export function sharpen(px: Uint8ClampedArray, w: number, h: number, amount = 0.45) {
  const src = new Uint8ClampedArray(px);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const k = i + c;
        const blur =
          (src[k - w * 4 - 4] + src[k - w * 4] + src[k - w * 4 + 4] + src[k - 4] + src[k] + src[k + 4] + src[k + w * 4 - 4] + src[k + w * 4] + src[k + w * 4 + 4]) / 9;
        px[k] = src[k] + (src[k] - blur) * amount;
      }
    }
}

/* ─── Picking the good ones (from hundreds) ─────────────────────────────── */

export type Look = { sharp: number; mean: number; hash: string };

/** Sharpness (variance of the Laplacian), brightness and a 64-bit difference hash, from a small copy. */
export function look(px: Uint8ClampedArray, w: number, h: number): Look {
  const lum = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < w * h; i++) sum += lum[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  let s1 = 0,
    s2 = 0,
    n = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const l = lum[i - 1] + lum[i + 1] + lum[i - w] + lum[i + w] - 4 * lum[i];
      s1 += l;
      s2 += l * l;
      n++;
    }
  const sharp = n ? s2 / n - (s1 / n) ** 2 : 0;
  // dHash: a 9×8 grey thumbnail, one bit per "brighter than the pixel to its right".
  const cell = (cx: number, cy: number) => {
    const x0 = Math.floor((cx * w) / 9),
      x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * w) / 9));
    const y0 = Math.floor((cy * h) / 8),
      y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * h) / 8));
    let t = 0,
      c = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) (t += lum[y * w + x]), c++;
    return t / c;
  };
  let hash = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) hash += cell(x, y) > cell(x + 1, y) ? "1" : "0";
  return { sharp, mean: sum / (w * h), hash };
}

export const hamming = (a: string, b: string) => {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
};

export type Verdict = "keep" | "blurry" | "dark" | "bright" | "duplicate";

/**
 * Which photos to keep, in the order given (the order they were taken). A burst of near-identical
 * shots keeps its sharpest; blurry means much less sharp than the rest of this batch (so a whole
 * soft-looking event isn't thrown away); too dark or blown out is judged on brightness alone.
 */
export function pickBest(looks: (Look | null)[]): Verdict[] {
  const sharps = looks.filter((l): l is Look => !!l).map((l) => l.sharp).sort((a, b) => a - b);
  const median = sharps.length ? sharps[Math.floor(sharps.length / 2)] : 0;
  const out: Verdict[] = looks.map((l) => {
    if (!l) return "keep";
    if (l.mean < 28) return "dark";
    if (l.mean > 235) return "bright";
    if (sharps.length >= 5 && l.sharp < median * 0.25) return "blurry";
    return "keep";
  });
  // Near-duplicates among the last few kept shots: only the sharpest stays.
  const recent: number[] = [];
  looks.forEach((l, i) => {
    if (!l || out[i] !== "keep") return;
    const twin = recent.find((j) => hamming(looks[j]!.hash, l.hash) <= 6);
    if (twin == null) {
      recent.push(i);
      if (recent.length > 4) recent.shift();
      return;
    }
    if (l.sharp > looks[twin]!.sharp) {
      out[twin] = "duplicate";
      recent[recent.indexOf(twin)] = i;
    } else out[i] = "duplicate";
  });
  return out;
}
