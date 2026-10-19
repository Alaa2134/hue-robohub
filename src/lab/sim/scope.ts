/**
 * Oscilloscope maths on recorded pin traces. A trace is piecewise constant: each point is the voltage
 * from that moment until the next point (the solver only changes values when a pin changes), so
 * every measurement here is exact for the simulated circuit, not sampled.
 */
export type Channel = { t: number[]; v: number[] };
export type Measure = { vmin: number; vmax: number; avg: number; freq: number | null; duty: number | null; edges: number };

/** Index of the last point at or before time t (−1 if none). */
export function at(c: Channel, t: number): number {
  let lo = 0;
  let hi = c.t.length - 1;
  if (hi < 0 || c.t[0] > t) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (c.t[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export const valueAt = (c: Channel, t: number) => {
  const i = at(c, t);
  return i < 0 ? null : c.v[i];
};

/** Rising (or falling) crossings of `level` between t0 and t1. */
export function crossings(c: Channel, t0: number, t1: number, level: number, rising = true): number[] {
  const out: number[] = [];
  let i = Math.max(0, at(c, t0));
  for (; i + 1 < c.t.length && c.t[i + 1] <= t1; i++) {
    const a = c.v[i];
    const b = c.v[i + 1];
    if (rising ? a < level && b >= level : a > level && b <= level) if (c.t[i + 1] >= t0) out.push(c.t[i + 1]);
  }
  return out;
}

/** Min, max, time-weighted average, and frequency and duty cycle over whole periods, in [t0, t1]. */
export function measure(c: Channel, t0: number, t1: number): Measure | null {
  const first = at(c, t0);
  if (first < 0 && (!c.t.length || c.t[0] > t1)) return null;
  let vmin = Infinity;
  let vmax = -Infinity;
  let area = 0;
  let span = 0;
  for (let i = Math.max(0, first); i < c.t.length && c.t[i] <= t1; i++) {
    const a = Math.max(t0, c.t[i]);
    const b = Math.min(t1, i + 1 < c.t.length ? c.t[i + 1] : t1);
    if (b <= a && !(i === c.t.length - 1)) continue;
    vmin = Math.min(vmin, c.v[i]);
    vmax = Math.max(vmax, c.v[i]);
    area += c.v[i] * Math.max(0, b - a);
    span += Math.max(0, b - a);
  }
  if (!Number.isFinite(vmin)) return null;
  const avg = span > 0 ? area / span : vmin;
  const mid = (vmin + vmax) / 2;
  let freq: number | null = null;
  let duty: number | null = null;
  const up = vmax - vmin > 0.2 ? crossings(c, t0, t1, mid, true) : [];
  if (up.length >= 2) {
    const period = (up[up.length - 1] - up[0]) / (up.length - 1);
    freq = 1 / period;
    // High time inside the whole periods between the first and last rising edge.
    let high = 0;
    const s = up[0];
    const e = up[up.length - 1];
    for (let i = Math.max(0, at(c, s)); i < c.t.length && c.t[i] < e; i++) {
      const a = Math.max(s, c.t[i]);
      const b = Math.min(e, i + 1 < c.t.length ? c.t[i + 1] : e);
      if (c.v[i] >= mid) high += Math.max(0, b - a);
    }
    duty = high / (e - s);
  }
  return { vmin, vmax, avg, freq, duty, edges: up.length };
}

/** Where to start the window: the latest trigger crossing that still leaves a full window before `now`. */
export function triggerTime(c: Channel, now: number, window: number, level: number, rising: boolean, keep: number): number | null {
  const list = crossings(c, now - keep, now - window, level, rising);
  return list.length ? list[list.length - 1] : null;
}

/** CSV of every change on the given channels in [t0, t1]: time, then one column per channel. */
export function toCsv(names: string[], chans: Channel[], t0: number, t1: number): string {
  const times = new Set<number>([t0]);
  for (const c of chans) for (let i = Math.max(0, at(c, t0)); i < c.t.length && c.t[i] <= t1; i++) if (c.t[i] >= t0) times.add(c.t[i]);
  const sorted = [...times].sort((a, b) => a - b);
  const rows = [`time_s,${names.map((n) => `${n}_V`).join(",")}`];
  for (const t of sorted) rows.push(`${t.toFixed(9)},${chans.map((c) => valueAt(c, t)?.toFixed(4) ?? "").join(",")}`);
  return rows.join("\n");
}
