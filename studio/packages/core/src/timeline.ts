/**
 * Timeline operations, all pure (they return a new timeline): the editor's undo/redo is a stack of
 * these results. Clips on one track never overlap; an operation that would overlap pushes the clips
 * after it to the right (except where a crossfade asks for the overlap, which the renderer handles).
 */
import { round3, type AssetInfo, type Clip, type MediaClip, type Timeline, type Track } from "./edl.ts";
import { newId } from "./presets.ts";

export const end = (c: Clip) => round3(c.start + c.duration);

export function duration(t: Timeline): number {
  let d = 0;
  for (const tr of t.tracks) for (const c of tr.clips) d = Math.max(d, end(c));
  return round3(d);
}

export function findClip(t: Timeline, id: string): { track: Track; clip: Clip; index: number } | null {
  for (const track of t.tracks) {
    const index = track.clips.findIndex((c) => c.id === id);
    if (index >= 0) return { track, clip: track.clips[index], index };
  }
  return null;
}

const sorted = (clips: Clip[]) => [...clips].sort((a, b) => a.start - b.start);

/** Push clips right so none overlap on the track (the earlier clip wins its place). */
export function settle(clips: Clip[], keep?: string): Clip[] {
  const list = sorted(clips);
  // The clip just placed keeps its spot; others make room after it.
  if (keep) {
    const k = list.find((c) => c.id === keep);
    if (k) {
      const before = list.filter((c) => c.id !== keep && c.start < k.start);
      const after = list.filter((c) => c.id !== keep && c.start >= k.start);
      const out: Clip[] = [];
      let cursor = 0;
      for (const c of before) {
        const s = Math.max(c.start, cursor);
        // An earlier clip that would run into the kept one is trimmed rather than moved past it.
        const room = k.start - s;
        if (room < 0.04) continue;
        const d = Math.min(c.duration, room);
        out.push({ ...c, start: round3(s), duration: round3(d) });
        cursor = s + d;
      }
      out.push(k);
      cursor = end(k);
      for (const c of after) {
        const s = Math.max(c.start, cursor);
        out.push({ ...c, start: round3(s) });
        cursor = s + c.duration;
      }
      return out;
    }
  }
  let cursor = 0;
  return list.map((c) => {
    const s = Math.max(c.start, cursor);
    cursor = s + c.duration;
    return s === c.start ? c : { ...c, start: round3(s) };
  });
}

function mapTrack(t: Timeline, trackId: string, f: (tr: Track) => Track): Timeline {
  return { ...t, tracks: t.tracks.map((tr) => (tr.id === trackId ? f(tr) : tr)) };
}

function mapClip(t: Timeline, id: string, f: (c: Clip) => Clip): Timeline {
  const at = findClip(t, id);
  if (!at) return t;
  return mapTrack(t, at.track.id, (tr) => ({ ...tr, clips: settle(tr.clips.map((c) => (c.id === id ? f(c) : c)), id) }));
}

/** How long a source can play from `in` at `speed` (Infinity for stills and titles). */
export function room(c: Clip, assets: Map<string, AssetInfo>): number {
  if (c.type !== "media") return Infinity;
  const a = assets.get(c.assetId);
  if (!a || a.kind === "image" || a.duration == null) return Infinity;
  return Math.max(0.04, (a.duration - c.in) / c.speed);
}

export function addClip(t: Timeline, trackId: string, clip: Clip): Timeline {
  return mapTrack(t, trackId, (tr) => ({ ...tr, clips: settle([...tr.clips, clip], clip.id) }));
}

/** Put a clip at the end of a track (what "add to timeline" from the media bin does). */
export function appendClip(t: Timeline, trackId: string, clip: Omit<Clip, "start">): Timeline {
  const tr = t.tracks.find((x) => x.id === trackId);
  const at = tr ? tr.clips.reduce((m, c) => Math.max(m, end(c)), 0) : 0;
  return addClip(t, trackId, { ...clip, start: round3(at) } as Clip);
}

export function removeClip(t: Timeline, id: string, ripple = false): Timeline {
  const at = findClip(t, id);
  if (!at) return t;
  return mapTrack(t, at.track.id, (tr) => ({
    ...tr,
    clips: tr.clips
      .filter((c) => c.id !== id)
      .map((c) => (ripple && c.start >= at.clip.start ? { ...c, start: round3(Math.max(0, c.start - at.clip.duration)) } : c)),
  }));
}

/** Move a clip in time and, optionally, to another track of the same kind. */
export function moveClip(t: Timeline, id: string, start: number, toTrack?: string): Timeline {
  const at = findClip(t, id);
  if (!at || at.track.locked) return t;
  const dest = toTrack ? t.tracks.find((x) => x.id === toTrack) : at.track;
  if (!dest || dest.locked || dest.kind !== at.track.kind) return t;
  const moved = { ...at.clip, start: round3(Math.max(0, start)) };
  if (dest.id === at.track.id) return mapClip(t, id, () => moved);
  return addClip(removeClip(t, id), dest.id, moved);
}

/** Trim either edge. `edge: "start"` moves the in-point with it (the content stays put under the playhead). */
export function trimClip(t: Timeline, id: string, edge: "start" | "end", time: number, assets: Map<string, AssetInfo>): Timeline {
  return mapClip(t, id, (c) => {
    if (edge === "end") {
      const d = Math.min(Math.max(0.04, time - c.start), room({ ...c, duration: 0 }, assets));
      return { ...c, duration: round3(d) };
    }
    const latest = end(c) - 0.04;
    let s = Math.min(Math.max(0, time), latest);
    if (c.type === "media") {
      // Can't start before the source does.
      const earliest = c.start - c.in / c.speed;
      s = Math.max(s, assets.get(c.assetId)?.kind === "image" ? 0 : earliest);
      const shift = s - c.start;
      return { ...c, start: round3(s), duration: round3(c.duration - shift), in: round3(Math.max(0, c.in + shift * c.speed)) };
    }
    return { ...c, start: round3(s), duration: round3(end(c) - s) };
  });
}

/** Cut a clip in two at a time on the timeline. Returns the timeline and the new right-hand clip id. */
export function splitClip(t: Timeline, id: string, time: number): { timeline: Timeline; right: string | null } {
  const at = findClip(t, id);
  if (!at) return { timeline: t, right: null };
  const c = at.clip;
  if (time <= c.start + 0.04 || time >= end(c) - 0.04) return { timeline: t, right: null };
  const leftDur = round3(time - c.start);
  const left: Clip = { ...c, duration: leftDur, ...(c.type === "media" ? { fadeOut: 0 } : {}) } as Clip;
  const rightId = newId("clip");
  const right: Clip =
    c.type === "media"
      ? ({ ...c, id: rightId, start: round3(time), duration: round3(c.duration - leftDur), in: round3(c.in + leftDur * c.speed), fadeIn: 0, transitionIn: null } as MediaClip)
      : { ...c, id: rightId, start: round3(time), duration: round3(c.duration - leftDur) };
  const timeline = mapTrack(t, at.track.id, (tr) => ({ ...tr, clips: sorted(tr.clips.flatMap((x) => (x.id === id ? [left, right] : [x]))) }));
  return { timeline, right: rightId };
}

/** A copy right after the original (later clips move over to make room). */
export function duplicateClip(t: Timeline, id: string): { timeline: Timeline; copy: string | null } {
  const at = findClip(t, id);
  if (!at) return { timeline: t, copy: null };
  const copy = { ...at.clip, id: newId("clip"), start: end(at.clip) } as Clip;
  return { timeline: addClip(t, at.track.id, copy), copy: copy.id };
}

export function updateClip<C extends Clip>(t: Timeline, id: string, patch: Partial<C>): Timeline {
  return mapClip(t, id, (c) => ({ ...c, ...patch }) as Clip);
}

export function updateTrack(t: Timeline, id: string, patch: Partial<Pick<Track, "muted" | "hidden" | "locked" | "name">>): Timeline {
  return mapTrack(t, id, (tr) => ({ ...tr, ...patch }));
}

export function addTrack(t: Timeline, kind: "video" | "audio"): Timeline {
  const count = t.tracks.filter((x) => x.kind === kind).length + 1;
  const track: Track = { id: newId(kind === "video" ? "v" : "a"), kind, name: `${kind === "video" ? "V" : "A"}${count}`, muted: false, hidden: false, locked: false, clips: [] };
  // New video tracks go on top of the other video tracks; audio at the end.
  if (kind === "audio") return { ...t, tracks: [...t.tracks, track] };
  const lastVideo = t.tracks.map((x) => x.kind).lastIndexOf("video");
  const tracks = [...t.tracks];
  tracks.splice(lastVideo + 1, 0, track);
  return { ...t, tracks };
}

/** Snap a time to the nearest clip edge or the playhead within `tol` seconds. */
export function snap(t: Timeline, time: number, tol: number, extra: number[] = [], ignore?: string): number {
  let best = time;
  let bestD = tol;
  const pts = [0, ...extra];
  for (const tr of t.tracks) for (const c of tr.clips) if (c.id !== ignore) pts.push(c.start, end(c));
  for (const p of pts) {
    const d = Math.abs(p - time);
    if (d < bestD) (best = p), (bestD = d);
  }
  return round3(best);
}

/** The visual clips showing at a time, bottom layer first (what the preview draws). */
export function visibleAt(t: Timeline, time: number): { track: Track; clip: Clip }[] {
  const out: { track: Track; clip: Clip }[] = [];
  for (const track of t.tracks) {
    if (track.kind !== "video" || track.hidden) continue;
    for (const clip of track.clips) if (time >= clip.start && time < end(clip)) out.push({ track, clip });
  }
  return out;
}

/**
 * Fill `seconds` with the given assets in order (videos up to `maxShot` seconds from their best third,
 * stills `still`). When they don't all fit, every shot is shortened alike so each file still appears;
 * when they're too few, they repeat.
 */
export function quickAssemble(
  t: Timeline,
  assets: AssetInfo[],
  { seconds, still = 2.5, maxShot = 4 }: { seconds: number; still?: number; maxShot?: number },
): Timeline {
  const visual = assets.filter((a) => a.kind === "video" || a.kind === "image");
  if (!visual.length) return t;
  const track = t.tracks.find((x) => x.kind === "video");
  if (!track) return t;
  const want = visual.map((a) => (a.kind === "image" ? still : Math.min(maxShot, a.duration ?? maxShot)));
  const sum = want.reduce((x, y) => x + y, 0);
  const k = sum > seconds ? seconds / sum : 1;
  let cursor = 0;
  const clips: Clip[] = [];
  let i = 0;
  while (cursor < seconds - 0.04 && i < 5000) {
    const a = visual[i % visual.length];
    const d = round3(Math.min(Math.max(0.5, want[i % visual.length] * k), seconds - cursor));
    if (d < 0.04) break;
    const inPt = a.kind === "video" && a.duration ? round3(Math.max(0, Math.min(a.duration - d, (a.duration - d) / 3))) : 0;
    clips.push({
      id: newId("clip"),
      type: "media",
      assetId: a.id,
      start: round3(cursor),
      duration: d,
      in: inPt,
      speed: 1,
      volume: a.kind === "video" ? 0.6 : 1,
      fadeIn: 0,
      fadeOut: 0,
      fit: "cover",
      transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
      motion: a.kind === "image" ? (i % 2 ? { from: { scale: 1.15, x: 0.04, y: 0 }, to: { scale: 1, x: 0, y: 0 } } : { from: { scale: 1, x: 0, y: 0 }, to: { scale: 1.15, x: -0.04, y: 0 } }) : null,
      transitionIn: clips.length ? { kind: "crossfade", duration: Math.min(0.4, d / 3) } : null, color: null, duck: false,
    });
    cursor += d;
    i++;
  }
  return mapTrack(t, track.id, (tr) => ({ ...tr, clips }));
}
