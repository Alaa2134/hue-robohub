/**
 * Every line Baqloz says that can be recorded once: his scripted lines (scenes, the tour, reactions,
 * games, answers, occasions, greetings), grouped by where he says them. Lines filled in at run time
 * ({n}, {p}…) and labels too short to be said on their own are left out. The generated voice
 * (scripts/build-voice.ts) and the team's own recordings (the app's "صوت بقلظ") both use this list.
 */
import * as journey from "@/config/mascotJourney";
import { FALLBACK, INTENTS } from "./guide";
import { spoken, voiceKey } from "./voice-text";
import { OCCASION_LINES } from "./wardrobe";

export type VoiceLine = { key: string; text: string; said: string; group: string };

/** Every Arabic line in these values (objects with an `ar` string, at any depth). */
function collect(value: unknown, into: string[], seen = new Set<unknown>()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  const ar = (value as { ar?: unknown }).ar;
  if (typeof ar === "string") into.push(ar);
  for (const v of Array.isArray(value) ? value : Object.values(value)) collect(v, into, seen);
}

/** Where he says them, in the order worth recording first. */
const GROUPS: [string, unknown][] = [
  ["التحيات", [0, 6, 13, 20].map((h) => journey.greeting(h))],
  ["لحظات بقلظ", journey.LINES],
  ["كلام وهو فاضي", journey.QUIPS],
  ["مشاهد الصفحات", journey.JOURNEY],
  ["الجولة في الموقع", journey.SITE_TOUR],
  ["أقسام الصفحات", journey.SECTION_RULES],
  ["لما يتشال ويترمي", journey.PHYSICS],
  ["لما تقاطعه", [journey.ACTIVITIES, journey.TEA]],
  ["الألعاب", journey.GAME],
  ["التراكات وفرق المسابقات", [journey.TRACKS, journey.TEAMS]],
  ["إجابات الأسئلة", [INTENTS, FALLBACK]],
  ["نصايح الفورمات", [journey.FIELD_TIPS, journey.LINE_INVALID]],
  ["المناسبات", OCCASION_LINES],
  ["القايمة والأسئلة المقترحة", Object.values(journey)],
];

let cache: VoiceLine[] | null = null;

export function voiceLines(): VoiceLine[] {
  if (cache) return cache;
  const out = new Map<string, VoiceLine>();
  for (const [group, value] of GROUPS) {
    const found: string[] = [];
    collect(value, found);
    for (const text of found) {
      const said = spoken(text);
      if (/[{}]/.test(text) || said.length < 4) continue;
      const key = voiceKey(text);
      if (!out.has(key)) out.set(key, { key, text, said, group });
    }
  }
  return (cache = [...out.values()]);
}
