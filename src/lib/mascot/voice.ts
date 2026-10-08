/**
 * Baqloz's voice: his lines read aloud with the browser's own speech synthesis, in an Arabic voice
 * (Egyptian when the device has one). On by default, but browsers only let a page speak after the
 * visitor's first click or tap, so nothing is heard before that; the visitor can turn it off in his
 * menu. Nothing is downloaded and nothing leaves the device.
 */
let voice: SpeechSynthesisVoice | null = null;

function choose() {
  const all = window.speechSynthesis?.getVoices() ?? [];
  voice = all.find((v) => /^ar[-_]EG/i.test(v.lang)) ?? all.find((v) => /^ar\b|^ar[-_]/i.test(v.lang)) ?? null;
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  choose();
  window.speechSynthesis.addEventListener?.("voiceschanged", choose);
}

/** Can this device speak Arabic? */
export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window && (choose(), !!voice);

/** Words an Arabic voice would stumble over, spelled the way he says them. */
const SAY: [RegExp, string][] = [
  [/BuildX\s*HUE/gi, "بيلد إكس هيو"],
  [/BuildX/gi, "بيلد إكس"],
  [/\bAI\b/g, "إيه آي"],
  [/\bIoT\b/gi, "آي أو تي"],
  [/\bQR\b/g, "كيو آر"],
  [/\b3D\b/gi, "ثري دي"],
];

/** Has the visitor clicked or tapped yet? (Speech and sound need that.) */
export const activated = () => typeof navigator === "undefined" || ((navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? true);

/** Say it aloud; resolves when he's done (or right away when he can't speak). */
export function speak(text: string): Promise<void> {
  if (!canSpeak()) return Promise.resolve();
  let t = text.replace(/\p{Extended_Pictographic}|️/gu, "").replace(/[«»]/g, "");
  for (const [re, said] of SAY) t = t.replace(re, said);
  const u = new SpeechSynthesisUtterance(t.trim());
  u.voice = voice;
  u.lang = voice?.lang ?? "ar-EG";
  u.rate = 1.02;
  u.pitch = 1.3;
  window.speechSynthesis.cancel();
  return new Promise<void>((done) => {
    // Some engines never fire "end"; don't wait past a generous estimate.
    const timer = setTimeout(done, 1500 + t.length * 110);
    u.onend = u.onerror = () => {
      clearTimeout(timer);
      done();
    };
    window.speechSynthesis.speak(u);
  });
}

export function hush() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
