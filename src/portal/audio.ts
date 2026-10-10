/**
 * A take of one of Baqloz's lines, made ready for the site on the phone itself: any recording or
 * audio file the browser can open is mixed to mono, cut to where the talking starts and ends,
 * cleaned of low rumble, optionally pitched up a little (he's a small furry mascot), brought to the
 * same loudness and saved as a small WAV that every browser plays.
 */

/** 0 = the person's own voice, 1 = a little higher (Baqloz), 2 = cartoon. */
export type VoiceEffect = 0 | 1 | 2;
const RATE: Record<VoiceEffect, number> = { 0: 1, 1: 1.12, 2: 1.3 };
const OUT_RATE = 22050;
export const MAX_SECONDS = 30;

type AudioCtor = typeof AudioContext;
const Ctx = (): AudioCtor | undefined =>
  typeof window === "undefined" ? undefined : window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;

/** Opens a recording or file (mp3, m4a, wav, ogg, webm… whatever this browser can play). */
export async function decodeAudio(blob: Blob): Promise<AudioBuffer> {
  const C = Ctx();
  if (!C) throw new Error("no_audio");
  const ctx = new C();
  try {
    return await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    void ctx.close();
  }
}

/** Mono samples between the first and last moment of talking (with a little air around them). */
function trimmed(buf: AudioBuffer): Float32Array {
  const n = buf.length;
  const mono = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) mono[i]! += d[i]! / buf.numberOfChannels;
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(mono[i]!));
  if (peak < 1e-4) return mono;
  // Loudness in 10 ms windows; talking is anything above a small part of the loudest moment.
  const win = Math.max(1, Math.round(buf.sampleRate / 100));
  const gate = Math.max(0.015, peak * 0.08);
  let first = -1;
  let last = -1;
  for (let w = 0; w * win < n; w++) {
    let sum = 0;
    const end = Math.min(n, (w + 1) * win);
    for (let i = w * win; i < end; i++) sum += mono[i]! * mono[i]!;
    if (Math.sqrt(sum / (end - w * win)) > gate) {
      if (first < 0) first = w * win;
      last = end;
    }
  }
  if (first < 0) return mono;
  const pad = Math.round(buf.sampleRate * 0.12);
  return mono.slice(Math.max(0, first - pad), Math.min(n, last + pad));
}

function wav(samples: Float32Array, rate: number): Blob {
  const data = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (at: number, s: string) => [...s].forEach((ch, i) => data.setUint8(at + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  data.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, 1, true);
  data.setUint32(24, rate, true);
  data.setUint32(28, rate * 2, true);
  data.setUint16(32, 2, true);
  data.setUint16(34, 16, true);
  text(36, "data");
  data.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) data.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i]!)) * 0x7fff), true);
  return new Blob([data.buffer], { type: "audio/wav" });
}

/** The take, ready to save: trimmed, cleaned, levelled and (if asked) pitched up. */
export async function prepareVoice(buf: AudioBuffer, effect: VoiceEffect): Promise<{ blob: Blob; seconds: number }> {
  const raw = trimmed(buf);
  const rate = RATE[effect];
  const seconds = raw.length / buf.sampleRate / rate;
  if (seconds > MAX_SECONDS) throw new Error("too_long");
  const src = new AudioBuffer({ length: Math.max(1, raw.length), numberOfChannels: 1, sampleRate: buf.sampleRate });
  src.getChannelData(0).set(raw);
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(seconds * OUT_RATE)), OUT_RATE);
  const node = off.createBufferSource();
  node.buffer = src;
  node.playbackRate.value = rate;
  const rumble = off.createBiquadFilter();
  rumble.type = "highpass";
  rumble.frequency.value = 85;
  node.connect(rumble).connect(off.destination);
  node.start();
  const out = (await off.startRendering()).getChannelData(0).slice();
  let peak = 0;
  for (const x of out) peak = Math.max(peak, Math.abs(x));
  const gain = peak > 1e-4 ? 0.89 / peak : 1;
  const fade = Math.min(out.length / 2, Math.round(OUT_RATE * 0.015));
  for (let i = 0; i < out.length; i++) {
    const edge = Math.min(1, i / fade, (out.length - 1 - i) / fade);
    out[i] = out[i]! * gain * (fade ? Math.max(0, edge) : 1);
  }
  return { blob: wav(out, OUT_RATE), seconds: Math.round(seconds * 100) / 100 };
}

/** Can this phone or browser record from the microphone here? */
export const canRecord = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

/** Records from the microphone until stop() (or MAX_SECONDS); resolves with the recording. */
export async function startRecording(): Promise<{ stop: () => Promise<Blob>; cancel: () => void }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const rec = new MediaRecorder(stream);
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const done = new Promise<Blob>((resolve) => {
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(parts, { type: rec.mimeType || parts[0]?.type || "audio/webm" }));
    };
  });
  rec.start(250);
  const limit = setTimeout(() => rec.state !== "inactive" && rec.stop(), MAX_SECONDS * 1000);
  return {
    stop: () => {
      clearTimeout(limit);
      if (rec.state !== "inactive") rec.stop();
      return done;
    },
    cancel: () => {
      clearTimeout(limit);
      if (rec.state !== "inactive") rec.stop();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
