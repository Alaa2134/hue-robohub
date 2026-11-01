/**
 * Forgiving text matching for the site search (the database's search_site does the same for live
 * content): Arabic letters unified (أ إ آ ا، ى ي، ة ه، ؤ و، ئ ي), no diacritics, Arabic-Indic
 * digits, words with or without their long vowels (روبت / ربوت / روبوت), one-letter typos, and the
 * Arabic/English name of the same thing (روبوت ↔ robot).
 */
const TASHKEEL = /[ً-ٰٟـ]/g;
const FROM = "أإآٱىةؤئ٠١٢٣٤٥٦٧٨٩";
const TO = "اااايهوي0123456789";

export function arNorm(s: string) {
  let out = "";
  // NFC keeps أ/إ/آ as one letter (NFKD would split off the hamza).
  for (const ch of s.normalize("NFC").replace(TASHKEEL, "").toLowerCase()) {
    const i = FROM.indexOf(ch);
    out += i >= 0 ? TO[i] : ch;
  }
  // Latin accents only (é → e); Arabic letters stay whole.
  return out
    .replace(/[À-ɏ]/g, (c) => c.normalize("NFKD").replace(/[̀-ͯ]/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

/** Long vowels inside a word dropped: روبوت، روبت، ربوت → ربت; robot, robt → rbt. */
export const skeleton = (s: string) => arNorm(s).replace(/(?<=[\p{L}\p{N}])[اويaeiou]/gu, "");

const PAIRS: [string, string][] = [
  ["روبوت", "robot"],
  ["روبوتات", "robotics"],
  ["اردوينو", "arduino"],
  ["مسابقه", "competition"],
  ["ورشه", "workshop"],
  ["حساس", "sensor"],
  ["سنسور", "sensor"],
  ["برمجه", "programming"],
  ["الكترونيات", "electronics"],
  ["معرض", "expo"],
  ["فعاليه", "event"],
  ["فعاليات", "events"],
  ["مشروع", "project"],
  ["مشاريع", "projects"],
  ["شهاده", "certificate"],
  ["طباعه", "printing"],
  ["موتور", "motor"],
  ["بوتكامب", "bootcamp"],
  ["امبيدد", "embedded"],
  ["رعايه", "sponsorship"],
  ["راعي", "sponsor"],
  ["انضمام", "join"],
  ["فريق", "team"],
  ["اخبار", "news"],
  ["جاليري", "gallery"],
  ["اسئله", "faq"],
];

/** The query and its other-language names. */
export function expand(q: string): string[] {
  const n = arNorm(q);
  const out = new Set([n]);
  const ns = skeleton(n);
  for (const [a, e] of PAIRS) {
    if (n.includes(a)) out.add(n.replace(a, e));
    else if (ns.includes(skeleton(a))) out.add(e);
    if (n.includes(e)) out.add(n.replace(e, a));
  }
  return [...out];
}

function lev(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]!);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

function wordMatches(q: string, words: string[], skels: string[]) {
  const qs = skeleton(q);
  return words.some((w, i) => {
    if (w.startsWith(q) || w.includes(q)) return true;
    if (qs.length >= 2 && (skels[i]!.startsWith(qs) || skels[i] === qs)) return true;
    const max = q.length >= 7 ? 2 : q.length >= 4 ? 1 : 0;
    return max > 0 && lev(q, w.slice(0, q.length + max), max) <= max;
  });
}

/** 0 = no match; higher = better. Every word of the query (in one of its languages) has to match. */
export function fuzzyScore(query: string, text: string): number {
  const hay = arNorm(text);
  // Each word also without «ال» / «وال» in front (الروبوت → روبوت).
  const words = hay
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .flatMap((w) => (/^و?ال./.test(w) ? [w, w.replace(/^و?ال/, "")] : [w]));
  const skels = words.map(skeleton);
  let best = 0;
  for (const q of expand(query)) {
    if (!q) continue;
    if (hay.includes(q)) return 3;
    const parts = q.split(" ").filter(Boolean);
    if (parts.length && parts.every((p) => wordMatches(p, words, skels))) best = Math.max(best, 1.5);
  }
  return best;
}
