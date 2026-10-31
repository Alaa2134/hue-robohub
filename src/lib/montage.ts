/**
 * The smart montage's brain (no AI, nothing leaves the device): from dozens of event videos, the
 * moments worth showing and the order to show them in. Each video was sampled every second or so
 * (src/portal/montage.tsx): how much moves, how sharp it is, how much of it is people (skin tones)
 * and how well lit. A window of a few seconds scores the average of its samples; each video gives its
 * best window (two if videos are few), the best of all opens the reel as the hook, the rest follow
 * in the order they were filmed. With music, every cut lands on the beat.
 */

export type Sample = { t: number; motion: number; sharp: number; skin: number; mean: number };
export type Clip = { duration: number; samples: Sample[]; at: number };
export type Segment = { clip: number; start: number; len: number; score: number };

export type Norm = { motion: number; sharp: number };

/** The scale every video is judged on (the busiest and sharpest moment of all of them). */
export function norms(clips: Clip[]): Norm {
  let motion = 1e-6,
    sharp = 1e-6;
  for (const c of clips)
    for (const s of c.samples) {
      motion = Math.max(motion, s.motion);
      sharp = Math.max(sharp, s.sharp);
    }
  return { motion, sharp };
}

/** How good one moment looks (0–1): too dark or blown out counts as nothing. */
export function sampleScore(s: Sample, n: Norm): number {
  if (s.mean < 35 || s.mean > 228) return 0;
  const motion = Math.min(1, (s.motion / n.motion) * 1.6);
  const sharp = Math.sqrt(Math.min(1, s.sharp / n.sharp));
  const people = Math.min(1, s.skin / 0.25);
  const light = 1 - Math.abs(s.mean - 128) / 128;
  return 0.33 * motion + 0.27 * sharp + 0.25 * people + 0.15 * light;
}

/** The best windows of `len` seconds in a video, best first (non-overlapping). */
export function bestWindows(c: Clip, len: number, n: Norm, max = 2): { start: number; score: number }[] {
  const end = c.duration - 0.15;
  if (end - 0.3 < len) return c.duration >= 1 ? [{ start: 0, score: avg(c.samples, 0, c.duration, n) }] : [];
  const starts = [0.3, ...c.samples.map((s) => s.t)].filter((t, i, a) => t >= 0.3 && t + len <= end && a.indexOf(t) === i);
  const scored = starts.map((start) => ({ start, score: avg(c.samples, start, start + len, n) })).sort((a, b) => b.score - a.score || a.start - b.start);
  const out: { start: number; score: number }[] = [];
  for (const w of scored) {
    if (out.length >= max) break;
    if (out.every((o) => Math.abs(o.start - w.start) >= len)) out.push(w);
  }
  return out;
}

function avg(samples: Sample[], from: number, to: number, n: Norm) {
  const inside = samples.filter((s) => s.t >= from - 0.01 && s.t < to);
  const use = inside.length ? inside : samples.filter((s) => Math.abs(s.t - from) < 1.5);
  return use.length ? use.reduce((a, s) => a + sampleScore(s, n), 0) / use.length : 0;
}

/** How long each shot lasts: a few beats of the music when there is music, else what fits the length. */
export function shotLength(target: number, clips: number, beat?: number | null): number {
  const plain = Math.min(3.2, Math.max(1.6, target / Math.max(1, Math.min(clips, Math.ceil(target / 2.4)))));
  if (!beat) return plain;
  let k = 1;
  while (beat * k < 1.4) k *= 2;
  while (beat * k > 3.4 && k > 1) k /= 2;
  return beat * k;
}

/** The montage: which moment of which video, in the order shown, about `target` seconds in all. */
export function planMontage(clips: Clip[], target: number, beat?: number | null): Segment[] {
  if (!clips.length) return [];
  const n = norms(clips);
  const len = shotLength(target, clips.length, beat);
  const count = Math.max(1, Math.round(target / len));
  const firsts: Segment[] = [];
  const seconds: Segment[] = [];
  clips.forEach((c, i) => {
    const w = bestWindows(c, len, n, 2);
    if (w[0]) firsts.push({ clip: i, start: w[0].start, len: Math.min(len, c.duration), score: w[0].score });
    if (w[1]) seconds.push({ clip: i, start: w[1].start, len, score: w[1].score });
  });
  firsts.sort((a, b) => b.score - a.score);
  seconds.sort((a, b) => b.score - a.score);
  // Weak moments (dark, still, blurry) only fill in when there's nothing better.
  const picked = [...firsts.filter((s) => s.score > 0.12), ...seconds.filter((s) => s.score > 0.2), ...firsts.filter((s) => s.score <= 0.12)].slice(0, count);
  if (!picked.length) return [];
  // The best moment opens (the hook); the rest follow in the order they were filmed.
  const hook = picked.reduce((a, b) => (b.score > a.score ? b : a));
  const rest = picked.filter((s) => s !== hook).sort((a, b) => clips[a.clip].at - clips[b.clip].at || a.clip - b.clip || a.start - b.start);
  return [hook, ...rest];
}

/**
 * The music's beat (seconds per beat) from its loudness over time (`env`, `rate` values a second):
 * the lag where the onsets repeat best, between 70 and 170 beats a minute. Null when there's no
 * clear beat.
 */
export function estimateBeat(env: Float32Array, rate: number): number | null {
  if (env.length < rate * 4) return null;
  const onset = new Float32Array(env.length);
  for (let i = 1; i < env.length; i++) onset[i] = Math.max(0, env[i] - env[i - 1]);
  const mean = onset.reduce((a, b) => a + b, 0) / onset.length;
  for (let i = 0; i < onset.length; i++) onset[i] = Math.max(0, onset[i] - mean);
  let best = 0,
    bestLag = 0,
    total = 0;
  const lo = Math.round((60 / 170) * rate),
    hi = Math.round((60 / 70) * rate);
  for (let lag = lo; lag <= hi; lag++) {
    let s = 0;
    for (let i = lag; i < onset.length; i++) s += onset[i] * onset[i - lag];
    total += s;
    if (s > best) [best, bestLag] = [s, lag];
  }
  const avgS = total / (hi - lo + 1);
  if (!bestLag || best < avgS * 1.25) return null;
  return bestLag / rate;
}

/** Output shapes. */
export const FORMATS = {
  reel: { w: 1080, h: 1920, label: "ريلز / ستوري (9:16)" },
  post: { w: 1080, h: 1350, label: "بوست (4:5)" },
  wide: { w: 1920, h: 1080, label: "يوتيوب / فيسبوك (16:9)" },
} as const;
export type FormatKey = keyof typeof FORMATS;

/* ─── The editor's decisions: story, rhythm, transitions ─────────────── */

export type Style = "energetic" | "cinematic" | "clean";
export type Transition = "cut" | "flash" | "whip" | "zoom" | "glitch" | "fade" | "dip";
export type Role = "hook" | "build" | "climax" | "close";
export type Shot = Segment & { role: Role; transition: Transition; speed: number; fit: "fill" | "blur" };

export const STYLES: Record<Style, { label: string; hint: string }> = {
  energetic: { label: "حماسي ⚡", hint: "قطع سريع على الإيقاع، فلاش، ويب، وجليتش — للمسابقات والريلز" },
  cinematic: { label: "سينمائي 🎬", hint: "أبطأ، سلو موشن في أقوى اللحظات، دمج ناعم، وشريطين سينما" },
  clean: { label: "نظيف", hint: "قطع بسيط وواضح — للمحاضرات والورش" },
};

function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}

/** How much a moment moves (0–1 on the batch's scale). */
function energy(c: Clip, s: Segment, n: Norm) {
  const inside = c.samples.filter((x) => x.t >= s.start - 0.01 && x.t < s.start + s.len);
  return inside.length ? Math.min(1, inside.reduce((a, x) => a + x.motion, 0) / inside.length / n.motion) : 0;
}
function people(c: Clip, s: Segment) {
  const inside = c.samples.filter((x) => x.t >= s.start - 0.01 && x.t < s.start + s.len);
  return inside.length ? inside.reduce((a, x) => a + x.skin, 0) / inside.length : 0;
}

/**
 * Turns the picked moments into an edit, the way an editor would: the hook first, a build-up in
 * filming order, the most energetic moments as the climax near the end, and a calm shot with people
 * to close on. Then the rhythm (energetic moments short, people moments longer), a transition that
 * suits each cut, slow motion where the style calls for it, and whole-frame on a blur for a wide
 * group shot that would lose its people in a tall crop.
 */
export function direct(clips: Clip[], plan: Segment[], o: { style: Style; seed: string; aspect: number; sizes: { w: number; h: number }[]; beat?: number | null }): Shot[] {
  if (!plan.length) return [];
  const n = norms(clips);
  const r = rng(o.seed + o.style);
  const [hook, ...rest] = plan;
  const e = (s: Segment) => energy(clips[s.clip], s, n);
  // The close: people, little movement (a group, a smile) — only when there are enough shots.
  let close: Segment | undefined;
  if (rest.length >= 3) close = [...rest].sort((a, b) => people(clips[b.clip], b) - e(b) * 0.1 - (people(clips[a.clip], a) - e(a) * 0.1))[0];
  const middle = rest.filter((s) => s !== close);
  const climaxN = middle.length >= 4 ? Math.min(3, Math.floor(middle.length / 3)) : 0;
  const climax = [...middle].sort((a, b) => e(b) - e(a)).slice(0, climaxN);
  const build = middle.filter((s) => !climax.includes(s));
  const ordered: [Segment, Role][] = [[hook, "hook"], ...build.map((s) => [s, "build"] as [Segment, Role]), ...climax.map((s) => [s, "climax"] as [Segment, Role]), ...(close ? [[close, "close"] as [Segment, Role]] : [])];

  const beat = o.beat ?? null;
  const snap = (x: number) => (beat ? Math.max(beat, Math.round(x / beat) * beat) : x);
  let prevEnergy = 0;
  return ordered.map(([s, role], i) => {
    const en = e(s);
    let len = s.len;
    if (o.style === "energetic") len = role === "close" ? s.len : en > 0.5 ? s.len * 0.6 : s.len * 0.85;
    if (o.style === "cinematic") len = role === "close" ? s.len * 1.5 : s.len * 1.25;
    len = Math.max(0.9, Math.min(4.5, snap(len)));
    let transition: Transition = "cut";
    if (i > 0) {
      if (o.style === "energetic") {
        const x = r();
        transition = role === "climax" && ordered[i - 1][1] !== "climax" ? "flash" : en > 0.55 && prevEnergy > 0.55 ? "whip" : x < 0.2 ? "glitch" : x < 0.55 ? "zoom" : "cut";
        if (role === "close") transition = "dip";
      } else if (o.style === "cinematic") transition = role === "close" ? "dip" : "fade";
      else transition = role === "close" ? "fade" : "cut";
    }
    const speed = o.style === "cinematic" && (role === "climax" || role === "close") ? 0.6 : 1;
    const size = o.sizes[s.clip] ?? { w: 16, h: 9 };
    const mismatch = Math.max(size.w / size.h / o.aspect, o.aspect / (size.w / size.h));
    const fit = mismatch > 1.5 && people(clips[s.clip], s) > 0.08 && en < 0.6 ? "blur" : "fill";
    prevEnergy = en;
    return { ...s, len, role, transition, speed, fit };
  });
}
