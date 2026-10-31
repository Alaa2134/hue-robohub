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
import { estimateBeat, type Clip, type Sample, type Shot, type Style } from "@/lib/montage";
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
  style: Style;
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

/** The look of each style: colour grade, film bars, how long a transition lasts. */
const LOOK: Record<Style, { grade: string; bars: number; trans: number; grain: number; vignette: number }> = {
  energetic: { grade: "contrast(1.14) saturate(1.22) brightness(1.03)", bars: 0, trans: 0.22, grain: 0.035, vignette: 0.35 },
  cinematic: { grade: "contrast(1.1) saturate(0.9) sepia(0.12) brightness(0.98)", bars: 0.075, trans: 0.45, grain: 0.05, vignette: 0.55 },
  clean: { grade: "contrast(1.05) saturate(1.06)", bars: 0, trans: 0.3, grain: 0, vignette: 0.15 },
};

const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

/** Play the edit into a canvas and record it. Returns the video file. */
export async function renderMontage(files: File[], shots: Shot[], o: RenderOpts): Promise<Blob> {
  if (typeof MediaRecorder === "undefined") throw new Error("no_recorder");
  await loadFonts();
  const logo = await loadLogo();
  const L = LOOK[o.style];
  const canvas = document.createElement("canvas");
  canvas.width = o.w;
  canvas.height = o.h;
  const ctx = canvas.getContext("2d")!;
  const sc = Math.min(o.w, o.h) / 1080;
  // The last frame of the previous shot (for crossfades and whips).
  const prev = document.createElement("canvas");
  prev.width = o.w;
  prev.height = o.h;
  const pctx = prev.getContext("2d")!;
  // Film grain: one noise tile, shifted every frame.
  const grain = document.createElement("canvas");
  grain.width = grain.height = 256;
  if (L.grain) {
    const g = grain.getContext("2d")!;
    const img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }

  // Sound: the clips (each through its own element) and the music, mixed into the recording.
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ac = new AC();
  const dest = ac.createMediaStreamDestination();
  let musicNode: AudioBufferSourceNode | null = null;
  let musicGain: GainNode | null = null;
  if (o.music) {
    try {
      const buf = await ac.decodeAudioData(await o.music.arrayBuffer());
      musicNode = ac.createBufferSource();
      musicNode.buffer = buf;
      musicNode.loop = true;
      musicGain = ac.createGain();
      musicGain.gain.value = 0;
      musicNode.connect(musicGain).connect(dest);
    } catch {
      musicNode = null;
    }
  }

  const stream = canvas.captureStream(30);
  dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  const type = recordType();
  const rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 9_000_000, audioBitsPerSecond: 160_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((ok) => (rec.onstop = () => ok()));

  // Each shot's element, ready (seeked, cropped around its subject) before its turn.
  const prepare = async (s: Shot) => {
    const v = videoOf(files[s.clip], !o.sound || s.speed !== 1);
    await once(v, "loadeddata");
    await seek(v, s.start);
    v.playbackRate = s.speed;
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
    let gain: GainNode | null = null;
    if (o.sound && s.speed === 1) {
      gain = ac.createGain();
      gain.gain.value = 0;
      ac.createMediaElementSource(v).connect(gain).connect(dest);
    }
    return { v, crop, gain };
  };

  /** One frame of a shot: filled around its subject (or whole on a blur), with a zoom. */
  const paint = (v: HTMLVideoElement, crop: Rect, s: Shot, z: number, dx = 0) => {
    const vw = v.videoWidth,
      vh = v.videoHeight;
    if (s.fit === "blur") {
      ctx.save();
      ctx.filter = "blur(28px) brightness(0.55) saturate(1.2)";
      const k = Math.max(o.w / vw, o.h / vh) * 1.1;
      ctx.drawImage(v, (o.w - vw * k) / 2 + dx, (o.h - vh * k) / 2, vw * k, vh * k);
      ctx.restore();
      const f = Math.min(o.w / vw, o.h / vh) * 0.96 * z;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 40 * sc;
      ctx.filter = L.grade;
      ctx.drawImage(v, (o.w - vw * f) / 2 + dx, (o.h - vh * f) / 2, vw * f, vh * f);
      ctx.restore();
      return;
    }
    const cw = crop.w * vw,
      ch = crop.h * vh;
    const zx = (cw * (1 - 1 / z)) / 2,
      zy = (ch * (1 - 1 / z)) / 2;
    ctx.save();
    ctx.filter = L.grade;
    ctx.drawImage(v, crop.x * vw + zx, crop.y * vh + zy, cw / z, ch / z, dx, 0, o.w, o.h);
    ctx.restore();
  };

  /** The finishing touches over every frame: vignette, grain, film bars, the logo. */
  const finish = (t: number) => {
    if (L.vignette) {
      const g = ctx.createRadialGradient(o.w / 2, o.h / 2, Math.min(o.w, o.h) * 0.35, o.w / 2, o.h / 2, Math.max(o.w, o.h) * 0.75);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(0,0,0,${L.vignette})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, o.w, o.h);
    }
    if (L.grain) {
      ctx.save();
      ctx.globalAlpha = L.grain;
      ctx.globalCompositeOperation = "overlay";
      const ox = Math.floor((t * 997) % 256),
        oy = Math.floor((t * 613) % 256);
      for (let x = -ox; x < o.w; x += 256) for (let y = -oy; y < o.h; y += 256) ctx.drawImage(grain, x, y);
      ctx.restore();
    }
    if (L.bars) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, o.w, o.h * L.bars);
      ctx.fillRect(0, o.h * (1 - L.bars), o.w, o.h * L.bars);
    }
    ctx.globalAlpha = 0.85;
    drawLogo(ctx, logo, 40 * sc, (L.bars ? o.h * L.bars : 0) + 36 * sc, 46 * sc);
    ctx.globalAlpha = 1;
  };

  /** The event's name sliding in over the opening shot (a bar wipes in, then the words). */
  const lowerThird = (t: number, len: number) => {
    if (!o.title) return;
    const out = Math.min(1, (len - t) * 3);
    const a = ease(t * 2.2) * out;
    if (a <= 0) return;
    const ar = isArabic(o.title);
    const base = o.h * (1 - L.bars) - 70 * sc;
    ctx.save();
    const g = ctx.createLinearGradient(0, base - 220 * sc, 0, o.h);
    g.addColorStop(0, "rgba(5,7,12,0)");
    g.addColorStop(1, `rgba(5,7,12,${0.85 * a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, base - 220 * sc, o.w, o.h);
    const barW = 10 * sc,
      x0 = ar ? o.w - 60 * sc - barW : 60 * sc;
    ctx.fillStyle = "#2563ff";
    ctx.fillRect(x0, base - 120 * sc * ease(t * 3), barW, 120 * sc * ease(t * 3));
    ctx.beginPath();
    ctx.rect(ar ? 0 : x0 + barW, base - 140 * sc, o.w - 60 * sc - barW, 160 * sc);
    ctx.clip();
    const slide = (1 - ease((t - 0.15) * 2.5)) * 120 * sc * (ar ? 1 : -1);
    ctx.globalAlpha = out;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = ar ? "right" : "left";
    ctx.font = `800 ${58 * sc}px ${ar ? F.arabic() : F.bold()}`;
    const tx = ar ? o.w - 90 * sc : 90 * sc;
    ctx.fillText(o.title, tx + slide, base - 50 * sc, o.w - 180 * sc);
    if (o.sub) {
      const slide2 = (1 - ease((t - 0.3) * 2.5)) * 120 * sc * (ar ? 1 : -1);
      ctx.font = `600 ${32 * sc}px ${F.sans()}`;
      ctx.fillStyle = "#c9d7ff";
      ctx.fillText(o.sub, tx + slide2, base - 2 * sc, o.w - 180 * sc);
    }
    ctx.restore();
  };

  /** Intro and outro cards, with words that move in. */
  const card = (t: number, kind: "intro" | "outro", len: number) => {
    ctx.fillStyle = "#05070c";
    ctx.fillRect(0, 0, o.w, o.h);
    const r = seeded(`${o.seed}:${kind}`);
    brush(ctx, -40 * sc, o.h * 0.2, o.w * 0.55 * ease(t * 2.5), 90 * sc, r, 1);
    brush(ctx, o.w * (1 - 0.6 * ease(t * 2)), o.h * 0.76, o.w * 0.6, 80 * sc, r, 0.8);
    const fade = Math.min(1, (len - t) * 4);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    if (kind === "intro") {
      ctx.globalAlpha = fade * ease(t * 3);
      ctx.font = `600 ${30 * sc}px ${F.sans()}`;
      ctx.fillStyle = "#9cb8ff";
      ctx.fillText("BuildX HUE presents", o.w / 2, o.h * 0.38);
      // The title, word by word.
      const fam = isArabic(o.title) ? F.arabic() : F.bold();
      let size = 110 * sc;
      ctx.font = `800 ${size}px ${fam}`;
      while (ctx.measureText(o.title).width > o.w * 0.86 && size > 30) ctx.font = `800 ${(size -= 4)}px ${fam}`;
      const words = o.title.split(/\s+/);
      const full = ctx.measureText(o.title).width;
      let x = o.w / 2 + (isArabic(o.title) ? full / 2 : -full / 2);
      ctx.textAlign = isArabic(o.title) ? "right" : "left";
      words.forEach((w, i) => {
        const k = ease((t - 0.25 - i * 0.12) * 3);
        ctx.globalAlpha = fade * k;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(w, x, o.h * 0.52 + (1 - k) * 40 * sc);
        const ww = ctx.measureText(w + " ").width;
        x += isArabic(o.title) ? -ww : ww;
      });
      ctx.textAlign = "center";
      if (o.sub) {
        ctx.globalAlpha = fade * ease((t - 0.7) * 3);
        ctx.font = `700 ${54 * sc}px ${F.note()}`;
        ctx.fillStyle = "#9cb8ff";
        ctx.fillText(o.sub, o.w / 2, o.h * 0.52 + 90 * sc);
      }
    } else {
      ctx.globalAlpha = fade * ease(t * 3);
      drawLogo(ctx, logo, o.w / 2 - 230 * sc, o.h * 0.38, 90 * sc);
      ctx.globalAlpha = fade * ease((t - 0.3) * 3);
      ctx.font = `400 ${96 * sc}px ${F.script()}`;
      ctx.fillText("Thank you", o.w / 2, o.h * 0.6);
      ctx.globalAlpha = fade * ease((t - 0.6) * 3);
      ctx.font = `600 ${34 * sc}px ${F.sans()}`;
      ctx.fillStyle = "#9cb8ff";
      ctx.fillText("buildxhue.com", o.w / 2, o.h * 0.6 + 80 * sc);
    }
    ctx.restore();
  };

  const frame = () => new Promise<number>((ok) => requestAnimationFrame(ok));
  const INTRO = 2.2,
    OUTRO = 2.6;
  const total = INTRO + shots.reduce((a, s) => a + s.len, 0) + OUTRO;
  let clock = 0;
  const run = async (len: number, draw: (t: number) => void) => {
    let last = await frame();
    for (let t = 0; t < len && !o.stop?.now; ) {
      draw(t);
      const now = await frame();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      t += dt;
      clock += dt;
      o.onProgress?.(Math.min(1, clock / total));
    }
  };

  let next = shots.length ? prepare(shots[0]) : null;
  rec.start(1000);
  if (ac.state === "suspended") await ac.resume().catch(() => undefined);
  if (musicNode && musicGain) {
    musicNode.start();
    // Music fades in, and out over the outro.
    musicGain.gain.setValueAtTime(0, ac.currentTime);
    musicGain.gain.linearRampToValueAtTime(o.sound ? 0.75 : 1, ac.currentTime + 1.2);
  }

  await run(INTRO, (t) => card(t, "intro", INTRO));
  pctx.drawImage(canvas, 0, 0);

  for (let i = 0; i < shots.length && !o.stop?.now; i++) {
    const s = shots[i];
    const cur = await next!;
    next = i + 1 < shots.length ? prepare(shots[i + 1]) : null;
    const { v, crop, gain } = cur;
    await v.play().catch(() => undefined);
    if (gain) gain.gain.linearRampToValueAtTime(o.music ? 0.55 : 1, ac.currentTime + 0.15);
    const T = L.trans;
    await run(s.len, (t) => {
      const p = t / T;
      // A slow push-in over the shot (stronger on the climax), a punch on a zoom cut.
      let z = (s.role === "climax" ? 1.12 : 1.07) - (s.role === "climax" ? 0.12 : 0.07) * Math.min(1, t / s.len);
      if (s.transition === "zoom" && p < 1) z *= 1 + 0.25 * (1 - ease(p));
      let dx = 0;
      if (s.transition === "whip" && p < 1) dx = (1 - ease(p)) * o.w;
      if (s.transition === "whip" && p < 1) {
        // The old shot leaves to the left as the new one comes in, smeared.
        ctx.drawImage(prev, dx - o.w, 0);
        for (let k = 1; k <= 3; k++) {
          ctx.globalAlpha = 0.25;
          paint(v, crop, s, z, dx + k * 40 * sc);
        }
        ctx.globalAlpha = 1;
      }
      paint(v, crop, s, z, dx);
      if (s.transition === "fade" && p < 1) {
        ctx.globalAlpha = 1 - ease(p);
        ctx.drawImage(prev, 0, 0);
        ctx.globalAlpha = 1;
      }
      if (s.transition === "dip" && p < 1.4) {
        ctx.fillStyle = `rgba(0,0,0,${Math.max(0, 1 - p / 1.4)})`;
        ctx.fillRect(0, 0, o.w, o.h);
      }
      if (s.transition === "flash" && p < 1) {
        ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - p)})`;
        ctx.fillRect(0, 0, o.w, o.h);
      }
      if (s.transition === "glitch" && p < 1) {
        // Slices knocked sideways, and the colours split.
        for (let k = 0; k < 7; k++) {
          const y = Math.random() * o.h,
            hgt = (10 + Math.random() * 60) * sc,
            off = (Math.random() - 0.5) * 120 * sc * (1 - p);
          ctx.drawImage(canvas, 0, y, o.w, hgt, off, y, o.w, hgt);
        }
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.35 * (1 - p);
        ctx.fillStyle = "#ff0040";
        ctx.fillRect(8 * sc, 0, o.w, o.h);
        ctx.fillStyle = "#00e0ff";
        ctx.fillRect(-8 * sc, 0, o.w, o.h);
        ctx.restore();
      }
      if (i === 0) lowerThird(t, s.len);
      finish(clock);
      pctx.drawImage(canvas, 0, 0);
    });
    if (gain) gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.1);
    drop(v);
  }

  // Outro: the music fades out under it.
  if (musicGain) {
    musicGain.gain.setValueAtTime(musicGain.gain.value, ac.currentTime);
    musicGain.gain.linearRampToValueAtTime(0, ac.currentTime + OUTRO);
  }
  await run(OUTRO, (t) => card(t, "outro", OUTRO));
  if (next) drop((await next).v);
  rec.stop();
  await stopped;
  musicNode?.stop();
  stream.getTracks().forEach((t) => t.stop());
  await ac.close().catch(() => undefined);
  return new Blob(chunks, { type: (type || "video/webm").split(";")[0] });
}
