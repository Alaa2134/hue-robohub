/**
 * Baqloz's voice: his lines read aloud with the browser's own speech synthesis, in an Arabic voice
 * (the most natural Egyptian one the device has). On by default, but browsers only let a page speak
 * after the visitor's first click or tap, so nothing is heard before that; the visitor can turn it
 * off in his menu. Nothing is downloaded and nothing leaves the device.
 */
let voice: SpeechSynthesisVoice | null = null;
/** How many voices the device listed (0 = not known yet: many Android phones list none). */
let listed = 0;
let unlocked = false;

const supported = () => typeof window !== "undefined" && "speechSynthesis" in window;

/** Egyptian first, then the natural-sounding (online / neural) voices, then any Arabic voice. */
function score(v: SpeechSynthesisVoice) {
  return (/^ar[-_]EG/i.test(v.lang) ? 4 : 0) + (/natural|online|neural|premium|enhanced/i.test(v.name) ? 3 : 0) + (v.localService ? 0 : 1);
}

function choose() {
  const all = window.speechSynthesis?.getVoices() ?? [];
  listed = all.length;
  voice = all.filter((v) => /^ar([-_]|$)/i.test(v.lang)).sort((a, b) => score(b) - score(a))[0] ?? null;
}

if (supported()) {
  choose();
  window.speechSynthesis.addEventListener?.("voiceschanged", choose);
}

/**
 * Can this device speak Arabic? When it hasn't listed its voices (as on many Android phones) we try
 * anyway: the engine picks a voice from the language.
 */
export const canSpeak = () => supported() && (choose(), !!voice || listed === 0);

/** The device lists its voices and none is Arabic (e.g. Chrome on Windows without Arabic installed). */
export const noArabicVoice = () => supported() && (choose(), listed > 0 && !voice);

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

const waiting: (() => void)[] = [];
/** Has the visitor's first tap or key unlocked his voice yet? */
export const isUnlocked = () => unlocked;
/** Runs once his voice is unlocked; returns a function that cancels it. */
export function onUnlock(f: () => void) {
  waiting.push(f);
  return () => {
    const i = waiting.indexOf(f);
    if (i >= 0) waiting.splice(i, 1);
  };
}

/**
 * Call from inside the visitor's first tap, click or key press: iPhones only let a page speak later
 * if speech was first started from a gesture, so this starts a silent one.
 */
export function unlock() {
  if (unlocked) return;
  unlocked = true;
  for (const f of waiting.splice(0)) f();
  if (!supported()) return;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  u.lang = voice?.lang ?? "ar-EG";
  window.speechSynthesis.speak(u);
}

/** Is he saying something right now? */
export const speaking = () => supported() && (window.speechSynthesis.speaking || window.speechSynthesis.pending);

/** Say it aloud; resolves when he's done (or right away when he can't speak). */
export function speak(text: string): Promise<void> {
  if (!canSpeak()) return Promise.resolve();
  let t = text.replace(/\p{Extended_Pictographic}|️/gu, "").replace(/[«»]/g, "");
  for (const [re, said] of SAY) t = t.replace(re, said);
  const u = new SpeechSynthesisUtterance(t.trim());
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? "ar-EG";
  u.rate = 1.02;
  // Natural voices sound odd pitched up; the plain ones get a younger, lighter voice.
  u.pitch = voice && score(voice) >= 3 ? 1.1 : 1.3;
  const synth = window.speechSynthesis;
  const busy = synth.speaking || synth.pending;
  if (busy) synth.cancel();
  // Chrome can get stuck paused (e.g. after a background tab).
  if (synth.paused) synth.resume();
  return new Promise<void>((done) => {
    // Some engines never fire "end"; don't wait past a generous estimate.
    const timer = setTimeout(done, 1500 + t.length * 110);
    u.onend = u.onerror = () => {
      clearTimeout(timer);
      done();
    };
    // Chrome sometimes drops an utterance queued in the same moment as a cancel.
    if (busy) setTimeout(() => synth.speak(u), 60);
    else synth.speak(u);
  });
}

export function hush() {
  if (supported()) window.speechSynthesis.cancel();
}
