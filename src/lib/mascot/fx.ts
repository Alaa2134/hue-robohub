/**
 * Small effects for the guide, with no files to download: soft synthesized sounds (off until the
 * visitor turns them on) and a short confetti burst on a canvas that removes itself.
 */
let ctx: AudioContext | null = null;

export type Sound = "pop" | "click" | "tada" | "whoosh";

/** Plays only when the visitor turned sound on (that toggle is the user gesture audio needs). */
export function playSound(kind: Sound) {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    const notes: [number, number, number][] =
      kind === "pop" ? [[880, 0, 0.09]] : kind === "click" ? [[660, 0, 0.06], [990, 0.05, 0.07]] : kind === "whoosh" ? [[320, 0, 0.18]] : [[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.12], [1047, 0.3, 0.28]];
    for (const [freq, at, dur] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === "whoosh" ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, now + at);
      if (kind === "pop") osc.frequency.exponentialRampToValueAtTime(freq * 1.6, now + at + dur);
      if (kind === "whoosh") osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + at + dur);
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.06, now + at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + dur + 0.02);
    }
  } catch {
    // No audio on this device: stay silent.
  }
}

const COLORS = ["#2f7bff", "#3cc4ff", "#63a0ff", "#e8b45c", "#f3f7fd", "#33d69f"];

/** A short confetti burst from a point on screen (skipped for reduced motion). */
export function confetti(from: { x: number; y: number }, count = 110) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: "70" });
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  document.body.appendChild(canvas);
  const g = canvas.getContext("2d");
  if (!g) return canvas.remove();
  g.scale(dpr, dpr);
  const parts = Array.from({ length: count }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
    const v = 7 + Math.random() * 9;
    return { x: from.x, y: from.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4, w: 5 + Math.random() * 5, h: 3 + Math.random() * 4, c: COLORS[(Math.random() * COLORS.length) | 0] };
  });
  const start = performance.now();
  const frame = (t: number) => {
    const age = (t - start) / 1000;
    g.clearRect(0, 0, window.innerWidth, window.innerHeight);
    g.globalAlpha = Math.max(0, 1 - Math.max(0, age - 1.3) / 0.6);
    for (const p of parts) {
      p.vy += 0.32;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.r);
      g.fillStyle = p.c;
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
      g.restore();
    }
    if (age < 1.9) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
