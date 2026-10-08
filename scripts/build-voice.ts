/**
 * Records Baqloz's scripted lines in a natural Egyptian voice (Azure Speech, "ar-EG-ShakirNeural"),
 * once, into small mp3 clips the site plays (src/lib/mascot/voice.ts). Only lines without a clip are
 * recorded, so a run after a few changed lines takes seconds. The free Azure tier (F0) allows 500,000
 * characters a month; all of his lines together are a few tens of thousands.
 *
 *   AZURE_SPEECH_KEY=… AZURE_SPEECH_REGION=westeurope npx tsx scripts/build-voice.ts --out voice
 *
 * Without a key it only lists what it would record. Writes <out>/<key>.mp3 and <out>/manifest.json.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as journey from "../src/config/mascotJourney";
import { FALLBACK, INTENTS } from "../src/lib/mascot/guide";
import { OCCASION_LINES } from "../src/lib/mascot/wardrobe";
import { spoken, voiceKey } from "../src/lib/mascot/voice-text";

const out = path.resolve(process.argv[process.argv.indexOf("--out") + 1] || "voice");
const key = process.env.AZURE_SPEECH_KEY;
const region = process.env.AZURE_SPEECH_REGION || "westeurope";
const voice = process.env.VOICE_NAME || "ar-EG-ShakirNeural";
// A little higher and livelier than the voice's default: he's a small furry mascot.
const pitch = process.env.VOICE_PITCH || "+8%";
const rate = process.env.VOICE_RATE || "+4%";

/** Every Arabic line in these values (objects with an `ar` string, at any depth). */
function collect(value: unknown, into: Set<string>, seen = new Set<unknown>()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  const ar = (value as { ar?: unknown }).ar;
  if (typeof ar === "string") into.add(ar);
  for (const v of Array.isArray(value) ? value : Object.values(value)) collect(v, into, seen);
}

const lines = new Set<string>();
collect(Object.values(journey), lines);
collect([INTENTS, FALLBACK, OCCASION_LINES], lines);
for (const h of [0, 6, 13, 20]) lines.add(journey.greeting(h).ar);
// Lines filled in at run time ({n}, {p}…) and labels too short to be said on their own are skipped.
const todo = [...lines].filter((l) => !/[{}]/.test(l) && spoken(l).length >= 4);
const keys = new Map(todo.map((l) => [voiceKey(l), spoken(l)]));

mkdirSync(out, { recursive: true });
const have = new Set(readdirSync(out).filter((f) => f.endsWith(".mp3")).map((f) => f.slice(0, -4)));
const missing = [...keys].filter(([k]) => !have.has(k));
const chars = missing.reduce((n, [, t]) => n + t.length, 0);
console.log(`[voice] ${keys.size} lines, ${keys.size - missing.length} recorded, ${missing.length} to record (${chars} characters)`);

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function record(text: string): Promise<Buffer> {
  const ssml = `<speak version="1.0" xml:lang="ar-EG"><voice name="${voice}"><prosody pitch="${pitch}" rate="${rate}">${xml(text)}</prosody></voice></speak>`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": key!, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "buildx-voice" },
      body: ssml,
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    // The free tier allows 20 requests a minute: wait and retry.
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      await sleep(Number(res.headers.get("retry-after") ?? 0) * 1000 || 4000 * (attempt + 1));
      continue;
    }
    throw new Error(`Azure Speech ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

if (!key) {
  console.log("[voice] AZURE_SPEECH_KEY is not set: nothing recorded.");
} else {
  let done = 0;
  for (const [k, text] of missing) {
    writeFileSync(path.join(out, `${k}.mp3`), await record(text));
    done++;
    if (done % 20 === 0) console.log(`[voice] ${done}/${missing.length}`);
    await sleep(3100);
  }
  console.log(`[voice] recorded ${done} clips`);
}

const recorded = [...keys.keys()].filter((k) => existsSync(path.join(out, `${k}.mp3`))).sort();
writeFileSync(path.join(out, "manifest.json"), JSON.stringify({ voice, clips: recorded }) + "\n");
console.log(`[voice] manifest: ${recorded.length} clips`);
