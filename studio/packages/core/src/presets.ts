/** Frame sizes, export choices and starting templates. */
import type { Settings, Timeline } from "./edl.ts";

export const ASPECTS = {
  "9:16": { w: 9, h: 16, label: "ريلز وستوري 9:16" },
  "16:9": { w: 16, h: 9, label: "يوتيوب 16:9" },
  "1:1": { w: 1, h: 1, label: "مربع 1:1" },
  "4:5": { w: 4, h: 5, label: "بوست 4:5" },
} as const;
export type Aspect = keyof typeof ASPECTS;

export const RESOLUTIONS = { "720p": 720, "1080p": 1080, "2160p": 2160 } as const;
export type Resolution = keyof typeof RESOLUTIONS;

export const FPS = [24, 25, 30, 60] as const;
export type Fps = (typeof FPS)[number];

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Output size: the short side gets the resolution (720/1080/2160), the long side follows the aspect. */
export function frameSize(aspect: Aspect, res: Resolution): { width: number; height: number } {
  const { w, h } = ASPECTS[aspect];
  const short = RESOLUTIONS[res];
  return w <= h ? { width: even(short), height: even((short * h) / w) } : { width: even((short * w) / h), height: even(short) };
}

/** A custom size, made encodable (even numbers, 144–4096 per side). */
export function customSize(width: number, height: number): { width: number; height: number } {
  const clamp = (n: number) => Math.min(4096, Math.max(144, even(n)));
  return { width: clamp(width), height: clamp(height) };
}

/** Same aspect at another resolution (for exporting a project at 720p/1080p/4K). */
export function scaleTo(settings: Pick<Settings, "width" | "height">, res: Resolution): { width: number; height: number } {
  const short = RESOLUTIONS[res];
  const k = short / Math.min(settings.width, settings.height);
  return customSize(settings.width * k, settings.height * k);
}

let n = 0;
export const newId = (p: string) => `${p}_${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function emptyTimeline(settings: Settings): Timeline {
  return {
    version: 1,
    settings,
    tracks: [
      { id: "v1", kind: "video", name: "V1", muted: false, hidden: false, locked: false, clips: [] },
      { id: "v2", kind: "video", name: "V2", muted: false, hidden: false, locked: false, clips: [] },
      { id: "t1", kind: "video", name: "T1", muted: false, hidden: false, locked: false, clips: [] },
      { id: "a1", kind: "audio", name: "A1", muted: false, hidden: false, locked: false, clips: [] },
    ],
  };
}

export const TEMPLATES = [
  { id: "reel", label: "ريل فعالية 9:16 — 30 ثانية", aspect: "9:16" as Aspect, fps: 30 as Fps },
  { id: "youtube", label: "فيديو يوتيوب 16:9", aspect: "16:9" as Aspect, fps: 30 as Fps },
  { id: "square", label: "بوست مربع 1:1", aspect: "1:1" as Aspect, fps: 30 as Fps },
  { id: "post", label: "بوست 4:5", aspect: "4:5" as Aspect, fps: 30 as Fps },
  { id: "cinema", label: "سينمائي 16:9 — 24 كادر", aspect: "16:9" as Aspect, fps: 24 as Fps },
] as const;
