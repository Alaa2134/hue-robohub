/**
 * What the frame at time t is made of — the preview's version of render-plan.ts, with the same rules
 * (crossfade tails, fades, dips, slides, Ken Burns), so what the editor shows is what FFmpeg renders.
 */
import type { Clip, Fit, MediaClip, Timeline } from "./edl.ts";
import { end } from "./timeline.ts";

export type LayerState = {
  clip: Clip;
  trackId: string;
  /** Seconds into the clip. */
  local: number;
  /** Seconds into the source file (videos). */
  sourceTime: number;
  /** 0–1: the layer's opacity at this moment (opacity × fades). */
  alpha: number;
  /** 0–1: how far it's faded to black (dips and fades from black). */
  black: number;
  /** Extra offset in output pixels (slides). */
  slideX: number;
  slideY: number;
  /** Ken Burns at this moment (null without motion). */
  motion: { zoom: number; dx: number; dy: number } | null;
};

export function layersAt(t: Timeline, time: number, W = t.settings.width, H = t.settings.height): LayerState[] {
  const out: LayerState[] = [];
  for (const track of t.tracks) {
    if (track.kind !== "video" || track.hidden) continue;
    const clips = [...track.clips].sort((a, b) => a.start - b.start);
    clips.forEach((c, k) => {
      const next = clips[k + 1];
      let tail = 0;
      if (next?.type === "media" && next.transitionIn?.kind === "crossfade" && Math.abs(next.start - end(c)) < 0.02) tail = next.transitionIn.duration;
      const dipOut = next?.type === "media" && next.transitionIn?.kind === "dip" && Math.abs(next.start - end(c)) < 0.02 ? next.transitionIn.duration : 0;
      if (time < c.start || time >= end(c) + tail) return;
      const local = time - c.start;
      const tr = c.type === "media" ? c.transitionIn : null;
      let alpha = c.transform.opacity;
      const fadeIn = Math.max(c.fadeIn, tr && tr.kind !== "none" && tr.kind !== "fade" && tr.kind !== "dip" ? tr.duration : 0);
      if (fadeIn > 0 && tr?.kind !== "slide-left" && tr?.kind !== "slide-up") alpha *= Math.min(1, local / fadeIn);
      if (c.fadeOut > 0 && local > c.duration - c.fadeOut) alpha *= Math.max(0, (c.duration - local) / c.fadeOut);
      let black = 0;
      if (tr && (tr.kind === "fade" || tr.kind === "dip") && tr.duration > 0 && local < tr.duration) black = Math.max(black, 1 - local / tr.duration);
      if (dipOut > 0 && local > c.duration - dipOut) black = Math.max(black, Math.min(1, (local - (c.duration - dipOut)) / dipOut));
      let slideX = 0;
      let slideY = 0;
      if (tr?.kind === "slide-left" && tr.duration > 0) slideX = W * Math.max(0, 1 - local / tr.duration);
      if (tr?.kind === "slide-up" && tr.duration > 0) slideY = H * Math.max(0, 1 - local / tr.duration);
      let motion: LayerState["motion"] = null;
      const m = c.type === "media" ? c.motion : null;
      if (m) {
        const p = Math.min(1, local / Math.max(0.001, c.duration + tail));
        motion = { zoom: m.from.scale + (m.to.scale - m.from.scale) * p, dx: m.from.x + (m.to.x - m.from.x) * p, dy: m.from.y + (m.to.y - m.from.y) * p };
      }
      out.push({ clip: c, trackId: track.id, local, sourceTime: c.type === "media" ? (c as MediaClip).in + local * (c as MediaClip).speed : 0, alpha: Math.max(0, Math.min(1, alpha)), black, slideX, slideY, motion });
    });
  }
  return out;
}

export type Rect = { x: number; y: number; w: number; h: number };

/** Where a source of sw×sh goes in a box of bw×bh (cover crops, contain letterboxes), centered at 0,0. */
export function fitRect(sw: number, sh: number, bw: number, bh: number, fit: Exclude<Fit, "blur"> | "cover"): { src: Rect; dst: Rect } {
  const k = fit === "contain" ? Math.min(bw / sw, bh / sh) : Math.max(bw / sw, bh / sh);
  const w = sw * k;
  const h = sh * k;
  if (fit === "contain") return { src: { x: 0, y: 0, w: sw, h: sh }, dst: { x: -w / 2, y: -h / 2, w, h } };
  // Cover: crop the source to the box's shape.
  const cw = bw / k;
  const ch = bh / k;
  return { src: { x: (sw - cw) / 2, y: (sh - ch) / 2, w: cw, h: ch }, dst: { x: -bw / 2, y: -bh / 2, w: bw, h: bh } };
}

/** Ken Burns window inside a cover-cropped source (same arithmetic as the zoompan filter). */
export function motionRect(cover: Rect, zoom: number, dx: number, dy: number): Rect {
  const w = cover.w / zoom;
  const h = cover.h / zoom;
  const x = Math.max(0, Math.min(cover.w - w, (cover.w - w) / 2 + (dx * cover.w) / 2));
  const y = Math.max(0, Math.min(cover.h - h, (cover.h - h) / 2 + (dy * cover.h) / 2));
  return { x: cover.x + x, y: cover.y + y, w, h };
}
