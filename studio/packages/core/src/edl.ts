/**
 * The edit-decision model: what a project's timeline is, as saved in the database, drawn by the
 * preview and rendered by FFmpeg. One schema for all three, so what you see is what renders.
 *
 * Times are in seconds (rounded to the millisecond). Video tracks stack in array order: the first
 * video track is the bottom layer. Positions are in output pixels relative to the frame's center, so a
 * clip keeps its place when the project is rendered at a different size (they scale with the frame).
 */
import { z } from "zod";

export const ASSET_KINDS = ["video", "image", "audio", "font"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const FITS = ["cover", "contain", "blur"] as const;
export type Fit = (typeof FITS)[number];

export const TRANSITIONS = ["none", "fade", "crossfade", "dip", "slide-left", "slide-up"] as const;
export type TransitionKind = (typeof TRANSITIONS)[number];

const sec = z.number().finite().min(0).max(6 * 3600);
const pos = z.number().finite().min(-1).max(1);

export const Transform = z.object({
  /** Center offset as a fraction of the frame (−1…1 = edge to edge). */
  x: pos.default(0),
  y: pos.default(0),
  scale: z.number().finite().min(0.05).max(10).default(1),
  rotation: z.number().finite().min(-360).max(360).default(0),
  opacity: z.number().finite().min(0).max(1).default(1),
});
export type Transform = z.infer<typeof Transform>;

export const Motion = z.object({
  /** Slow zoom/pan over the clip (Ken Burns): from → to, each a scale ≥ 1 and a center offset. */
  from: z.object({ scale: z.number().min(1).max(3), x: pos, y: pos }),
  to: z.object({ scale: z.number().min(1).max(3), x: pos, y: pos }),
});
export type Motion = z.infer<typeof Motion>;

/** Color correction: the same numbers drive FFmpeg (eq + colorbalance) and the preview (canvas filters). */
export const Color = z.object({
  brightness: z.number().min(-0.5).max(0.5).default(0),
  contrast: z.number().min(0.5).max(2).default(1),
  saturation: z.number().min(0).max(3).default(1),
  /** −1 cool … +1 warm. */
  temperature: z.number().min(-1).max(1).default(0),
});
export type Color = z.infer<typeof Color>;

/** Looks: starting points for the sliders. */
export const LOOKS: Record<string, { label: string; color: Color | null }> = {
  none: { label: "طبيعي", color: null },
  vivid: { label: "ألوان زاهية", color: { brightness: 0.02, contrast: 1.12, saturation: 1.35, temperature: 0 } },
  warm: { label: "دافي", color: { brightness: 0.02, contrast: 1.05, saturation: 1.1, temperature: 0.5 } },
  cool: { label: "بارد", color: { brightness: 0, contrast: 1.05, saturation: 1, temperature: -0.5 } },
  cinematic: { label: "سينمائي", color: { brightness: -0.04, contrast: 1.18, saturation: 0.85, temperature: 0.25 } },
  bw: { label: "أبيض وأسود", color: { brightness: 0, contrast: 1.2, saturation: 0, temperature: 0 } },
  faded: { label: "باهت ناعم", color: { brightness: 0.06, contrast: 0.85, saturation: 0.8, temperature: 0.1 } },
};

export const TITLE_STYLES = ["plain", "box", "lower-third", "headline", "caption"] as const;
export const TITLE_ANIMATIONS = ["none", "rise", "slide"] as const;

export const Transition = z.object({ kind: z.enum(TRANSITIONS), duration: z.number().min(0).max(5) });
export type Transition = z.infer<typeof Transition>;

const clipBase = {
  id: z.string().min(1).max(64),
  /** Where the clip sits on the timeline, and for how long. */
  start: sec,
  duration: z.number().finite().min(0.04).max(6 * 3600),
};

export const MediaClip = z.object({
  ...clipBase,
  type: z.literal("media"),
  assetId: z.string().min(1).max(64),
  /** Where in the source the clip begins (videos and audio). */
  in: sec.default(0),
  speed: z.number().min(0.25).max(4).default(1),
  volume: z.number().min(0).max(2).default(1),
  fadeIn: z.number().min(0).max(10).default(0),
  fadeOut: z.number().min(0).max(10).default(0),
  fit: z.enum(FITS).default("cover"),
  transform: Transform.default({ x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }),
  motion: Motion.nullable().default(null),
  transitionIn: Transition.nullable().default(null),
  color: Color.nullable().default(null),
  /** Music: lowered automatically while the videos' own sound is loud (people talking). */
  duck: z.boolean().default(false),
});
export type MediaClip = z.infer<typeof MediaClip>;

export const TextClip = z.object({
  ...clipBase,
  type: z.literal("text"),
  text: z.string().min(1).max(500),
  font: z.string().max(64).default("Plex Arabic"),
  /** Font size as a fraction of the frame height. */
  size: z.number().min(0.01).max(0.4).default(0.06),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#ffffff"),
  box: z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/).nullable().default(null),
  weight: z.number().int().min(100).max(900).default(700),
  align: z.enum(["start", "center", "end"]).default("center"),
  transform: Transform.default({ x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }),
  fadeIn: z.number().min(0).max(10).default(0.3),
  fadeOut: z.number().min(0).max(10).default(0.3),
  /** Motion-graphics templates: a lower third (name + role), a headline, a caption bar. */
  style: z.enum(TITLE_STYLES).default("plain"),
  subtitle: z.string().max(200).nullable().default(null),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#45d0ff"),
  /** How it comes in and goes out (over its fade-in / fade-out time). */
  animation: z.enum(TITLE_ANIMATIONS).default("none"),
});
export type TextClip = z.infer<typeof TextClip>;

export const Clip = z.discriminatedUnion("type", [MediaClip, TextClip]);
export type Clip = z.infer<typeof Clip>;

export const Track = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(["video", "audio"]),
  name: z.string().max(40).default(""),
  muted: z.boolean().default(false),
  hidden: z.boolean().default(false),
  locked: z.boolean().default(false),
  clips: z.array(Clip).max(2000),
});
export type Track = z.infer<typeof Track>;

export const Settings = z.object({
  width: z.number().int().min(144).max(4096),
  height: z.number().int().min(144).max(4096),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#000000"),
});
export type Settings = z.infer<typeof Settings>;

export const Timeline = z.object({
  version: z.literal(1),
  settings: Settings,
  tracks: z.array(Track).min(1).max(24),
});
export type Timeline = z.infer<typeof Timeline>;

/** What the renderer needs to know about a source file (from ffprobe at upload). */
export const AssetInfo = z.object({
  id: z.string(),
  kind: z.enum(ASSET_KINDS),
  duration: z.number().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  hasAudio: z.boolean(),
});
export type AssetInfo = z.infer<typeof AssetInfo>;

export function parseTimeline(json: unknown): Timeline {
  return Timeline.parse(json);
}

export const round3 = (n: number) => Math.round(n * 1000) / 1000;
