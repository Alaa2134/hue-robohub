/**
 * The event carousel (an 8-slide Instagram post in the BuildX style): which slides it has, the words
 * on each (from the event: its name, what it was, the place and the day; the rest is the house style),
 * and which photo goes where, by plain image maths (no AI): the clearest wide shot is the cover, the
 * shot with the most people in it is "the family", the rest fill the other slides best first. A slide
 * without enough photos is left out rather than repeating one.
 */
import { pickBest, type Look } from "./photo-frame";

export type SlideKey = "cover" | "arrival" | "highlights" | "action" | "team" | "behind" | "family" | "thanks";

/** Photos each slide holds (the team grid takes 3 to 6). */
export const SLOTS: Record<SlideKey, number> = { cover: 1, arrival: 2, highlights: 3, action: 2, team: 6, behind: 3, family: 1, thanks: 0 };
/** The order they're filled in when photos are few: the strongest slides first. */
const FILL: SlideKey[] = ["highlights", "action", "arrival", "behind", "team"];
export const ORDER: SlideKey[] = ["cover", "arrival", "highlights", "action", "team", "behind", "family", "thanks"];

export type CarouselPhoto = { w: number; h: number; look: (Look & { skin: number }) | null };

/** For each slide in the carousel, the indexes of its photos (slides that couldn't be filled are absent). */
export function assignPhotos(photos: CarouselPhoto[]): Partial<Record<SlideKey, number[]>> {
  const verdict = pickBest(photos.map((p) => p.look));
  const ok = photos.map((p, i) => ({ p, i })).filter((x) => verdict[x.i] === "keep");
  const maxSharp = Math.max(1, ...ok.map((x) => x.p.look?.sharp ?? 0));
  const score = (p: CarouselPhoto) => (p.look ? 0.5 * Math.min(1, p.look.skin / 0.3) + 0.4 * Math.sqrt(p.look.sharp / maxSharp) + 0.1 * (1 - Math.abs(p.look.mean - 128) / 128) : 0.3);
  const wide = (p: CarouselPhoto) => p.w / p.h >= 1.15;
  const ranked = ok.sort((a, b) => score(b.p) - score(a.p) || a.i - b.i).map((x) => x.i);
  const used = new Set<number>();
  const take = (i: number | undefined) => (i === undefined ? undefined : (used.add(i), i));
  const out: Partial<Record<SlideKey, number[]>> = {};

  // The family: the wide shot with the most people (a group photo), when there are enough photos to spare one.
  if (ranked.length >= 4) {
    const fam = [...ranked].filter((i) => wide(photos[i])).sort((a, b) => (photos[b].look?.skin ?? 0) - (photos[a].look?.skin ?? 0))[0];
    if (fam !== undefined && (photos[fam].look?.skin ?? 0) >= 0.06) out.family = [take(fam)!];
  }
  // The cover: the best wide shot left (any shot if none is wide).
  const cover = take(ranked.find((i) => !used.has(i) && wide(photos[i])) ?? ranked.find((i) => !used.has(i)));
  if (cover !== undefined) out.cover = [cover];

  for (const key of FILL) {
    const left = ranked.filter((i) => !used.has(i));
    const need = SLOTS[key];
    if (key === "team") {
      const n = left.length >= 6 ? 6 : left.length >= 3 ? 3 : 0;
      if (n) out.team = left.slice(0, n).map((i) => take(i)!);
    } else if (left.length >= need) out[key] = left.slice(0, need).map((i) => take(i)!);
  }
  return out;
}

/** What it was, for the slide titles. */
export type CarouselKind = "competition" | "summit" | "conference" | "workshop" | "course" | "visit" | "talk" | "event";

export type CarouselText = {
  /** Big title on the cover (the event's name). */
  title: string;
  /** Brush line under it. */
  tagline: string;
  place: string;
  /** Shown as written, e.g. «30 October 2026». */
  date: string;
  kind: CarouselKind;
  /** «From Horus University to E-JUST»: only when there's a place. */
  from: string;
};

export type SlideWords = { top: string; big: string; notes: string[]; foot?: string[] };

const HIGHLIGHT: Record<CarouselKind, string> = {
  competition: "COMPETITION",
  summit: "SUMMIT",
  conference: "CONFERENCE",
  workshop: "WORKSHOP",
  course: "COURSE",
  visit: "VISIT",
  talk: "SESSION",
  event: "EVENT",
};

/** The words on every slide, from the event and the house style. */
export function slideWords(t: CarouselText): Record<SlideKey, SlideWords> {
  const compete = t.kind === "competition" || t.kind === "summit";
  const learn = t.kind === "workshop" || t.kind === "course" || t.kind === "talk";
  return {
    cover: { top: "", big: t.title, notes: [t.tagline || "Our Journey"] },
    arrival: { top: "THE", big: "ARRIVAL", notes: ["Early morning", "Same passion", "Bigger goals..."], foot: t.place ? [`${t.from || "From our campus"}`, `to ${t.place}`] : ["Ready to begin"] },
    highlights: {
      top: HIGHLIGHT[t.kind],
      big: "HIGHLIGHTS",
      notes: learn ? ["Hands-on learning", "New skills", "Real projects", "Great mentors"] : ["Inspiring talks", "New ideas", "Amazing people", "Greater opportunities"],
    },
    action: compete
      ? { top: "IN", big: "COMPETITION MODE", notes: ["Design", "Build", "Code", "Compete"] }
      : learn
        ? { top: "HANDS-ON", big: "MODE", notes: ["Build", "Test", "Fix", "Repeat"] }
        : { top: "IN", big: "ACTION", notes: ["Explore", "Learn", "Connect", "Grow"] },
    team: { top: "OUR", big: "TEAM", notes: ["BuildX Gang"], foot: ["One team", "One community", "Same vision"] },
    behind: { top: "BEHIND", big: "THE SCENES", notes: ["Prep", "Teamwork", "Challenges", "Quick fixes", "Fun moments", "And more..."] },
    family: { top: "THE", big: "FAMILY", notes: ["More than", "a team", "A community"], foot: ["Same passion", "Brighter future"] },
    thanks: { top: "Thank You", big: "FOR AN INCREDIBLE EXPERIENCE!", notes: ["New Knowledge", "Amazing People", "Greater Opportunities", "Future Challenges"] },
  };
}

/** A tiny seeded random (the same event always gets the same brush strokes and tilts). */
export function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let x = h;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Split a title into at most `max` balanced lines (by words). */
export function splitTitle(title: string, max = 3, perLine = 14): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > perLine && lines.length < max - 1) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  lines.push(cur);
  return lines;
}
