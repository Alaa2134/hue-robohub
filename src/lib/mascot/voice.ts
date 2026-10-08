/**
 * Baqloz's voice. His scripted lines are recorded in a natural Egyptian voice (scripts/build-voice.ts
 * makes the clips at deploy time; public/voice/manifest.json lists them) and played from the site.
 * Lines without a recording (a name, a live number, an AI answer) stay silent unless the visitor turns
 * on the device's own voice in his menu: browser voices are Modern Standard and robotic, so it's off
 * by default. Browsers only let a page play sound after the visitor's first click or tap.
 */
import { greeting } from "@/config/mascotJourney";
import { BASE_PATH } from "@/lib/deploy";
import { spoken, voiceKey } from "./voice-text";

const DEVICE_KEY = "bx-guide-device-voice";
let unlocked = false;
let clips: Set<string> | null = null;
let loading: Promise<Set<string>> | null = null;
let audio: HTMLAudioElement | null = null;
let playing = false;
/** Bumped by every new line and by hush(), so a line that was cut off stops before its next clip. */
let gen = 0;

const browser = () => typeof window !== "undefined";
const synthOk = () => browser() && "speechSynthesis" in window;

/** The list of recorded lines (fetched once; an empty list when there are none). */
export function loadVoice(): Promise<Set<string>> {
  if (clips) return Promise.resolve(clips);
  if (!browser()) return Promise.resolve(new Set());
  loading ??= fetch(`${BASE_PATH}/voice/manifest.json`)
    .then((r) => (r.ok ? (r.json() as Promise<{ clips?: string[] }>) : { clips: [] }))
    .then((m) => (clips = new Set(m.clips ?? [])))
    .catch(() => (clips = new Set()));
  return loading;
}

/* ─── The device's own voice (optional) ────────────────────────────────── */

let device: SpeechSynthesisVoice | null = null;
let listed = 0;
function choose() {
  const all = window.speechSynthesis?.getVoices() ?? [];
  listed = all.length;
  const score = (v: SpeechSynthesisVoice) => (/^ar[-_]EG/i.test(v.lang) ? 4 : 0) + (/natural|online|neural|premium|enhanced/i.test(v.name) ? 3 : 0);
  device = all.filter((v) => /^ar([-_]|$)/i.test(v.lang)).sort((a, b) => score(b) - score(a))[0] ?? null;
}
if (synthOk()) {
  choose();
  window.speechSynthesis.addEventListener?.("voiceschanged", choose);
}

/** Has the visitor turned on the device voice for lines with no recording? */
export function deviceVoiceOn(): boolean {
  try {
    return localStorage.getItem(DEVICE_KEY) === "1";
  } catch {
    return false;
  }
}
export function setDeviceVoice(on: boolean) {
  try {
    localStorage.setItem(DEVICE_KEY, on ? "1" : "0");
  } catch {}
}
const deviceCan = () => synthOk() && (choose(), !!device || listed === 0);
/** The device lists its voices and none is Arabic (e.g. Chrome on Windows without Arabic installed). */
export const noArabicVoice = () => synthOk() && (choose(), listed > 0 && !device);

/* ─── Recorded clips ───────────────────────────────────────────────────── */

/** The greeting he puts before a page's first line ("صباح الفل ☀️ …") is its own clip. */
const GREETINGS = [0, 6, 13, 20].map((h) => spoken(greeting(h).ar));

/** The clips that say this line: the whole line, or a greeting followed by a recorded line. */
function clipsFor(text: string): string[] | null {
  if (!clips?.size) return null;
  const key = voiceKey(text);
  if (clips.has(key)) return [key];
  const s = spoken(text);
  for (const g of GREETINGS)
    if (s.startsWith(`${g} `)) {
      const rest = voiceKey(s.slice(g.length + 1));
      const head = voiceKey(g);
      if (clips.has(head) && clips.has(rest)) return [head, rest];
    }
  return null;
}

function player() {
  audio ??= new Audio();
  audio.preload = "auto";
  return audio;
}

function playClip(key: string): Promise<void> {
  const a = player();
  return new Promise<void>((done) => {
    const finish = () => {
      clearTimeout(timer);
      a.onended = a.onerror = a.onpause = null;
      done();
    };
    const timer = setTimeout(finish, 20000);
    a.onended = a.onerror = a.onpause = finish;
    a.src = `${BASE_PATH}/voice/${key}.mp3`;
    a.play().catch(finish);
  });
}

/* ─── Public API ───────────────────────────────────────────────────────── */

/** Can he say anything at all here (recordings, or the device voice the visitor turned on)? */
export const canSpeak = () => !!clips?.size || (deviceVoiceOn() && deviceCan());
/** Can he say this particular line? */
export const canSay = (text: string) => !!clipsFor(text) || (deviceVoiceOn() && deviceCan());

/** Has the visitor clicked or tapped yet? (Sound needs that.) */
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
 * Call from inside the visitor's first tap, click or key press: iPhones only let a page play sound
 * later if it first played from a gesture, so this plays a moment of silence (and starts a silent
 * utterance for the device voice).
 */
export function unlock() {
  if (unlocked) return;
  unlocked = true;
  for (const f of waiting.splice(0)) f();
  if (!browser()) return;
  void loadVoice();
  const a = player();
  a.src = `${BASE_PATH}/voice/silence.mp3`;
  a.play().catch(() => undefined);
  if (synthOk() && deviceVoiceOn()) {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  }
}

/** Is he saying something right now? */
export const speaking = () => playing || (synthOk() && (window.speechSynthesis.speaking || window.speechSynthesis.pending));

/** Say it aloud; resolves when he's done (or right away when he can't say it). */
export async function speak(text: string): Promise<void> {
  await loadVoice();
  hush();
  const my = gen;
  const parts = clipsFor(text);
  if (parts) {
    playing = true;
    try {
      for (const key of parts) {
        if (gen !== my) break;
        await playClip(key);
      }
    } finally {
      if (gen === my) playing = false;
    }
    return;
  }
  if (!deviceVoiceOn() || !deviceCan()) return;
  const t = spoken(text);
  const u = new SpeechSynthesisUtterance(t);
  if (device) u.voice = device;
  u.lang = device?.lang ?? "ar-EG";
  u.rate = 1;
  u.pitch = 1;
  return new Promise<void>((done) => {
    const timer = setTimeout(done, 1500 + t.length * 110);
    u.onend = u.onerror = () => {
      clearTimeout(timer);
      done();
    };
    window.speechSynthesis.speak(u);
  });
}

/** Stop talking. */
export function hush() {
  gen++;
  playing = false;
  if (audio && !audio.paused) audio.pause();
  if (synthOk()) window.speechSynthesis.cancel();
}
