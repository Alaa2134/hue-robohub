/**
 * How a line is said aloud, shared by the recorded voice (scripts/build-voice.ts) and the site: the
 * same text always gets the same clip name, so the site finds the recording for whatever is on screen.
 */

/** Words an Arabic voice would stumble over, spelled the way he says them. */
const SAY: [RegExp, string][] = [
  [/BuildX\s*HUE/gi, "بيلد إكس هيو"],
  [/BuildX/gi, "بيلد إكس"],
  [/\bAI\b/g, "إيه آي"],
  [/\bIoT\b/gi, "آي أو تي"],
  [/\bQR\b/g, "كيو آر"],
  [/\b3D\b/gi, "ثري دي"],
];

/** The words as spoken: no emoji or quote marks, brand names spelled out, single spaces. */
export function spoken(text: string): string {
  let t = text.replace(/\p{Extended_Pictographic}|‍|️/gu, "").replace(/[«»"]/g, "");
  for (const [re, said] of SAY) t = t.replace(re, said);
  return t.replace(/\s+/g, " ").trim();
}

/** The clip's file name for a line (FNV-1a of the spoken words, 8 hex digits). */
export function voiceKey(text: string): string {
  const s = spoken(text);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
