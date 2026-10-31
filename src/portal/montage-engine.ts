"use client";
/**
 * The smart montage, on the device (nothing is uploaded, no AI cost): each video is sampled about
 * once a second (motion, sharpness, people, light), the plan picks the moments (src/lib/montage.ts),
 * then the reel is played into a canvas in real time — a BuildX intro card, each moment cropped
 * around its subject with a small zoom-in and a flash on the cut, the event's name on the opening
 * shot, the logo in the corner, and an outro — and recorded with its sound (the clips' own sound,
 * music, or both: the music ducks under them). MP4 where the browser can record it, WebM otherwise.
 */
import { bestCrop, look, saliency, type Rect } from "@/lib/photo-frame";
import { skinShare } from "@/lib/photo-pick";
import { estimateBeat, type Clip, type Sample, type Segment } from "@/lib/montage";
import { brush, drawLogo, F, isArabic, loadFonts, loadLogo } from "./carousel-draw";
import { seeded } from "@/lib/carousel";

const SW = 72;

function once(el: EventTarget, ok: string, timeout = 8000) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => (cleanup(), reject(new Error(`timeout:${ok}`))), timeout);
    const done = () => (cleanup(), resolve());
    const fail = () => (cleanup(), reject(new Error("video_unreadable")));
    const cleanup = () => {
      clearTimeout(t);
      el.removeEventListener(ok, done);
      el.removeEventListener("error", fail);
    };
    el.addEventListener(ok, done, { once: true });
    el.addEventListener("error", fail, { once: true });
  });
}

async function seek(v: HTMLVideoElement, t: number) {
  if (Math.abs(v.currentTime - t) < 0.01) return;
  const p = once(v, "seeked");
  v.currentTime = t;
  await p;
}

function videoOf(file: Blob, muted = true) {
  const v = document.createElement("video");
  v.muted = muted;
  v.playsInline = true;
  v.preload = "auto";
  v.crossOrigin = "anonymous";
  v.src = URL.createObjectURL(file);
  return v;
}
const drop = (v: HTMLVideoElement) => {
  v.pause();
  URL.revokeObjectURL(v.src);
  v.removeAttribute("src");
  v.load();
};

export type Analysed = { clip: Clip; w: number; h: number; thumb: string };

/** One video sampled about once a second (at most 40 looks): motion, sharpness, people, light. */
export async function analyse(file: File): Promise<Analysed | null> {
  const v = videoOf(file);
  try {
    await once(v, "loadeddata");
    const d = v.duration;
    if (!isFinite(d) || d < 0.8 || !v.videoWidth) return null;
    const sh = Math.max(8, Math.round((SW * v.videoHeight) / v.videoWidth));
    const c = document.createElement("canvas");
    c.width = SW;
    c.height = sh;
    const x = c.getContext("2d", { willReadFrequently: true })!;
    const step = Math.max(1, d / 40);
    const samples: Sample[] = [];
    let prev: Float32Array | null = null;
    let thumb = "";
    for (let t = Math.min(0.2, d / 2); t < d - 0.05; t += step) {
      await seek(v, t);
      x.drawImage(v, 0, 0, SW, sh);
      const px = x.getImageData(0, 0, SW, sh).data;
      const l = look(px, SW, sh);
      const luma = new Float32Array(SW * sh);
      for (let i = 0; i < luma.length; i++) luma[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      let motion = 0;
      if (prev) {
        for (let i = 0; i < luma.length; i++) motion += Math.abs(luma[i] - prev[i]);
        motion /= luma.length;
      }
      prev = luma;
      samples.push({ t, motion, sharp: l.sharp, skin: skinShare(px), mean: l.mean });
      if (!thumb && t >= Math.min(1, d / 3)) thumb = c.toDataURL("image/jpeg", 0.6);
    }
    // The first sample has nothing to compare with: give it the next one's motion.
    if (samples.length > 1) samples[0].motion = samples[1].motion;
    return { clip: { duration: d, samples, at: file.lastModified || 0 }, w: v.videoWidth, h: v.videoHeight, thumb: thumb || c.toDataURL("image/jpeg", 0.6) };
  } catch {
    return null;
  } finally {
    drop(v);
  }
}

/** The music's beat (seconds per beat), from its loudness. */
export async function musicBeat(file: Blob): Promise<number | null> {
  try {
    const ac = new OfflineAudioContext(1, 44100, 44100);
    const buf = await ac.decodeAudioData(await file.arrayBuffer());
    const data = buf.getChannelData(0);
    const rate = 100;
    const hop = Math.floor(buf.sampleRate / rate);
    const n = Math.min(Math.floor(data.length / hop), rate * 90);
    const env = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = i * hop; j < (i + 1) * hop; j++) s += data[j] * data[j];
      env[i] = Math.sqrt(s / hop);
    }
    return estimateBeat(env, rate);
  } catch {
    return null;
  }
}

export type RenderOpts = {
  w: number;
  h: number;
  title: string;
  sub: string;
  music?: Blob | null;
  /** Keep the clips' own sound (under the music when there is music). */
  sound: boolean;
  seed: string;
  onProgress?: (done: number) => void;
  stop?: { now: boolean };
};

/** The best recording format this browser has (MP4 first: Instagram and WhatsApp want it). */
export function recordType(): string {
  const types = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return types.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

const INTRO = 1.8;
const OUTRO = 2.4;

/** Play the plan into a canvas and record it. Returns the video file. */
export async function renderMontage(files: File[], plan: Segment[], o: RenderOpts): Promise<Blob> {
  if (typeof MediaRecorder === "undefined") throw new Error("no_recorder");
  await loadFonts();
  const logo = await loadLogo();
  const canvas = document.createElement("canvas");
  canvas.width = o.w;
  canvas.height = o.h;
  const ctx = canvas.getContext("2d")!;

  // Sound: the clips (each through its own element) and the music, mixed into the recording.
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ac = new AC();
  const dest = ac.createMediaStreamDestination();
  let musicNode: AudioBufferSourceNode | null = null;
  if (o.music) {
    try {
      const buf = await ac.decodeAudioData(await o.music.arrayBuffer());
      musicNode = ac.createBufferSource();
      musicNode.buffer = buf;
      const g = ac.createGain();
      g.gain.value = o.sound ? 0.75 : 1;
      musicNode.connect(g).connect(dest);
    } catch {
      musicNode = null;
    }
  }

  const stream = canvas.captureStream(30);
  dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  const type = recordType();
  const rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 160_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((ok) => (rec.onstop = () => ok()));

  // Each shot's element, ready (seeked) before its turn.
  const prepare = async (s: Segment) => {
    const v = videoOf(files[s.clip], !o.sound);
    await once(v, "loadeddata");
    await seek(v, s.start);
    let crop: Rect = { x: 0, y: 0, w: 1, h: 1 };
    try {
      const sh = Math.max(8, Math.round((SW * v.videoHeight) / v.videoWidth));
      const c = document.createElement("canvas");
      c.width = SW;
      c.height = sh;
      const x = c.getContext("2d", { willReadFrequently: true })!;
      x.drawImage(v, 0, 0, SW, sh);
      crop = bestCrop(saliency(x.getImageData(0, 0, SW, sh).data, SW, sh), SW, sh, o.w / o.h);
    } catch {
      /* centre crop */
    }
    if (o.sound) {
      const g = ac.createGain();
      g.gain.value = o.music ? 0.55 : 1;
      ac.createMediaElementSource(v).connect(g).connect(dest);
    }
    return { v, crop };
  };

  const frame = () => new Promise<number>((ok) => requestAnimationFrame(ok));
  const total = INTRO + plan.reduce((a, s) => a + s.len, 0) + OUTRO;
  let clock = 0;
  const tick = (dt: number) => {
    clock += dt;
    o.onProgress?.(Math.min(1, clock / total));
  };

  const card = (t: number, kind: "intro" | "outro") => {
    ctx.fillStyle = "#05070c";
    ctx.fillRect(0, 0, o.w, o.h);
    const s = Math.min(o.w, o.h) / 1080;
    const r = seeded(`${o.seed}:${kind}`);
    brush(ctx, -40 * s, o.h * 0.18, o.w * 0.55, 90 * s, r, Math.min(1, t * 3));
    brush(ctx, o.w * 0.5, o.h * 0.78, o.w * 0.6, 80 * s, r, Math.min(1, t * 3) * 0.8);
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 2.5);
    ctx.translate(0, (1 - Math.min(1, t * 2.5)) * 30 * s);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    if (kind === "intro") {
      drawLogo(ctx, logo, o.w / 2 - 190 * s, o.h * 0.3, 74 * s);
      const fam = isArabic(o.title) ? F.arabic() : F.bold();
      let size = 110 * s;
      ctx.font = `800 ${size}px ${fam}`;
      while (ctx.measureText(o.title).width > o.w * 0.86 && size > 30) ctx.font = `800 ${(size -= 4)}px ${fam}`;
      ctx.fillText(o.title, o.w / 2, o.h * 0.52);
      if (o.sub) {
        ctx.font = `700 ${54 * s}px ${F.note()}`;
        ctx.fillStyle = "#9cb8ff";
        ctx.fillText(o.sub, o.w / 2, o.h * 0.52 + 90 * s);
      }
    } else {
      drawLogo(ctx, logo, o.w / 2 - 230 * s, o.h * 0.4, 90 * s);
      ctx.font = `400 ${90 * s}px ${F.script()}`;
      ctx.fillText("Thank you", o.w / 2, o.h * 0.6);
      ctx.font = `600 ${34 * s}px ${F.sans()}`;
      ctx.fillStyle = "#9cb8ff";
      ctx.fillText("buildxhue.com", o.w / 2, o.h * 0.6 + 80 * s);
    }
    ctx.restore();
  };

  let next = plan.length ? prepare(plan[0]) : null;
  rec.start(1000);
  if (ac.state === "suspended") await ac.resume().catch(() => undefined);
  musicNode?.start();

  // Intro.
  let last = await frame();
  for (let t = 0; t < INTRO; ) {
    if (o.stop?.now) break;
    card(t, "intro");
    const now = await frame();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    t += dt;
    tick(dt);
  }

  for (let i = 0; i < plan.length && !o.stop?.now; i++) {
    const s = plan[i];
    const cur = await next!;
    next = i + 1 < plan.length ? prepare(plan[i + 1]) : null;
    const { v, crop } = cur;
    await v.play().catch(() => undefined);
    last = await frame();
    for (let t = 0; t < s.len && !o.stop?.now; ) {
      // Cropped around the subject, a slow zoom-in, a flash on the cut.
      const z = 1.08 - 0.08 * Math.min(1, t / s.len);
      const cw = crop.w * v.videoWidth,
        ch = crop.h * v.videoHeight;
      const zx = (cw * (1 - 1 / z)) / 2,
        zy = (ch * (1 - 1 / z)) / 2;
      ctx.drawImage(v, crop.x * v.videoWidth + zx, crop.y * v.videoHeight + zy, cw / z, ch / z, 0, 0, o.w, o.h);
      if (t < 0.18 && i > 0) {
        ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - t / 0.18)})`;
        ctx.fillRect(0, 0, o.w, o.h);
      }
      const sc = Math.min(o.w, o.h) / 1080;
      // The logo in the corner; the event's name on the opening shot.
      ctx.globalAlpha = 0.85;
      drawLogo(ctx, logo, 40 * sc, 40 * sc, 46 * sc);
      ctx.globalAlpha = 1;
      if (i === 0 && o.title) {
        const a = Math.min(1, t * 3) * Math.min(1, (s.len - t) * 3);
        ctx.save();
        ctx.globalAlpha = Math.max(0, a);
        const g = ctx.createLinearGradient(0, o.h * 0.72, 0, o.h);
        g.addColorStop(0, "rgba(5,7,12,0)");
        g.addColorStop(1, "rgba(5,7,12,0.85)");
        ctx.fillStyle = g;
        ctx.fillRect(0, o.h * 0.72, o.w, o.h * 0.28);
        ctx.fillStyle = "#2563ff";
        ctx.fillRect(60 * sc, o.h - 190 * sc, 10 * sc, 110 * sc);
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = isArabic(o.title) ? "right" : "left";
        ctx.font = `800 ${58 * sc}px ${isArabic(o.title) ? F.arabic() : F.bold()}`;
        const x = isArabic(o.title) ? o.w - 90 * sc : 90 * sc;
        ctx.fillText(o.title, x, o.h - 120 * sc, o.w - 180 * sc);
        if (o.sub) {
          ctx.font = `600 ${32 * sc}px ${F.sans()}`;
          ctx.fillStyle = "#c9d7ff";
          ctx.fillText(o.sub, x, o.h - 72 * sc, o.w - 180 * sc);
        }
        ctx.restore();
      }
      const now = await frame();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      t += dt;
      tick(dt);
      if (v.ended) break;
    }
    drop(v);
  }

  // Outro.
  last = await frame();
  for (let t = 0; t < OUTRO && !o.stop?.now; ) {
    card(t, "outro");
    const now = await frame();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    t += dt;
    tick(dt);
  }
  if (next) drop((await next).v);
  rec.stop();
  await stopped;
  musicNode?.stop();
  stream.getTracks().forEach((t) => t.stop());
  await ac.close().catch(() => undefined);
  return new Blob(chunks, { type: (type || "video/webm").split(";")[0] });
}
