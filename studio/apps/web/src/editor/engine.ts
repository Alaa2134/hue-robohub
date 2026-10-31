/**
 * The preview: draws the frame at the playhead on a canvas from the real files (videos, stills,
 * titles), with the same layer rules as the render (packages/core/src/compose.ts). While playing, the
 * videos and sounds play in sync with the clock; while paused, each video is sought to the exact
 * frame and drawn when it lands.
 */
import { drawTitle, duration, end, FONTS, fitRect, layersAt, motionRect, type Clip, type MediaClip, type TextClip, type Timeline } from "@studio/core";
import type { Asset } from "../api.ts";

const fontUrls = import.meta.glob("../../../../fonts/*.woff2", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
let fontsReady: Promise<void> | null = null;
export function loadFonts(): Promise<void> {
  fontsReady ??= Promise.all(
    Object.values(FONTS).map(async (f) => {
      const url = Object.entries(fontUrls).find(([k]) => k.endsWith(`/${f.file}`))?.[1];
      if (!url) return;
      const face = new FontFace(f.family, `url(${url})`);
      document.fonts.add(await face.load());
    }),
  ).then(() => undefined);
  return fontsReady;
}

export class PreviewEngine {
  time = 0;
  playing = false;
  private timeline: Timeline;
  private assets = new Map<string, Asset>();
  private videos = new Map<string, HTMLVideoElement>(); // per clip (each plays its own part)
  private audios = new Map<string, HTMLAudioElement>();
  private images = new Map<string, HTMLImageElement>();
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private clock = { at: 0, t: 0 };
  private onTime: (t: number) => void;
  private scale = 1;

  constructor(
    private canvas: HTMLCanvasElement,
    timeline: Timeline,
    onTime: (t: number) => void,
  ) {
    this.timeline = timeline;
    this.ctx = canvas.getContext("2d")!;
    this.onTime = onTime;
    this.resize();
    void loadFonts().then(() => this.draw());
    this.raf = requestAnimationFrame(this.tick);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    for (const v of this.videos.values()) (v.pause(), v.removeAttribute("src"), v.load());
    for (const a of this.audios.values()) (a.pause(), a.removeAttribute("src"));
  }

  setTimeline(t: Timeline) {
    const resized = t.settings.width !== this.timeline.settings.width || t.settings.height !== this.timeline.settings.height;
    this.timeline = t;
    if (resized) this.resize();
    // Drop players for clips that are gone.
    const ids = new Set(t.tracks.flatMap((x) => x.clips.map((c) => c.id)));
    for (const [id, v] of this.videos) if (!ids.has(id)) (v.pause(), this.videos.delete(id));
    for (const [id, a] of this.audios) if (!ids.has(id)) (a.pause(), this.audios.delete(id));
    if (!this.playing) this.draw();
  }

  setAssets(list: Asset[]) {
    this.assets = new Map(list.map((a) => [a.id, a]));
    if (!this.playing) this.draw();
  }

  private resize() {
    const { width, height } = this.timeline.settings;
    // Preview at up to 960 px on the long side (the export renders at full size).
    this.scale = Math.min(1, 960 / Math.max(width, height));
    this.canvas.width = Math.round(width * this.scale);
    this.canvas.height = Math.round(height * this.scale);
  }

  play() {
    if (this.playing) return;
    if (this.time >= duration(this.timeline) - 0.02) this.time = 0;
    this.playing = true;
    this.clock = { at: performance.now(), t: this.time };
  }

  pause() {
    this.playing = false;
    for (const v of this.videos.values()) v.pause();
    for (const a of this.audios.values()) a.pause();
    this.draw();
  }

  seek(t: number) {
    this.time = Math.max(0, Math.min(t, duration(this.timeline)));
    this.clock = { at: performance.now(), t: this.time };
    if (!this.playing) this.draw();
    this.onTime(this.time);
  }

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick);
    if (!this.playing) return;
    const total = duration(this.timeline);
    this.time = this.clock.t + (performance.now() - this.clock.at) / 1000;
    if (this.time >= total) {
      this.time = total;
      this.pause();
    }
    this.syncAudio();
    this.draw();
    this.onTime(this.time);
  };

  private videoFor(c: MediaClip, a: Asset): HTMLVideoElement {
    let v = this.videos.get(c.id);
    const src = a.preview ?? a.url ?? "";
    if (!v || v.dataset.src !== src) {
      v?.pause();
      v = document.createElement("video");
      v.crossOrigin = "anonymous";
      v.preload = "auto";
      v.playsInline = true;
      v.dataset.src = src;
      v.src = src;
      v.addEventListener("seeked", () => !this.playing && this.draw());
      v.addEventListener("loadeddata", () => !this.playing && this.draw());
      this.videos.set(c.id, v);
    }
    return v;
  }

  private imageFor(a: Asset): HTMLImageElement {
    let i = this.images.get(a.id);
    if (!i) {
      i = new Image();
      i.crossOrigin = "anonymous";
      i.decoding = "async";
      i.onload = () => !this.playing && this.draw();
      i.src = a.preview ?? a.url ?? "";
      this.images.set(a.id, i);
    }
    return i;
  }

  /** Sound from the audio tracks (video clips play their own sound through their video element). */
  private syncAudio() {
    const t = this.time;
    for (const track of this.timeline.tracks) {
      if (track.kind !== "audio") continue;
      for (const c of track.clips) {
        if (c.type !== "media") continue;
        const a = this.assets.get(c.assetId);
        if (!a?.url) continue;
        let el = this.audios.get(c.id);
        const on = t >= c.start && t < end(c) && !track.muted;
        if (!on) {
          el?.pause();
          continue;
        }
        if (!el) {
          el = new Audio();
          el.preload = "auto";
          el.crossOrigin = "anonymous";
          el.src = a.preview ?? a.url;
          this.audios.set(c.id, el);
        }
        const local = t - c.start;
        const want = c.in + local * c.speed;
        el.playbackRate = c.speed;
        let vol = c.volume;
        if (c.fadeIn > 0 && local < c.fadeIn) vol *= local / c.fadeIn;
        if (c.fadeOut > 0 && local > c.duration - c.fadeOut) vol *= Math.max(0, (c.duration - local) / c.fadeOut);
        el.volume = Math.max(0, Math.min(1, vol));
        if (Math.abs(el.currentTime - want) > 0.3) el.currentTime = want;
        if (el.paused) void el.play().catch(() => undefined);
      }
    }
  }

  draw() {
    const { ctx } = this;
    const { width: W, height: H, background } = this.timeline.settings;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.globalAlpha = 1;
    ctx.filter = "none";
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, W, H);
    const layers = layersAt(this.timeline, this.time, W, H);
    const live = new Set<string>();
    const mutedTracks = new Set(this.timeline.tracks.filter((x) => x.muted).map((x) => x.id));
    for (const L of layers) {
      const c = L.clip;
      if (c.type === "text") {
        ctx.save();
        ctx.globalAlpha = L.alpha;
        drawTitle(ctx as never, c as TextClip, W, H);
        ctx.restore();
        continue;
      }
      const a = this.assets.get(c.assetId);
      if (!a || a.status !== "ready") continue;
      let el: HTMLVideoElement | HTMLImageElement;
      let sw: number;
      let sh: number;
      if (a.kind === "video") {
        const v = this.videoFor(c, a);
        live.add(c.id);
        const want = Math.min(L.sourceTime, Math.max(0, (a.duration ?? 0) - 0.04));
        v.muted = mutedTracks.has(L.trackId) || c.volume === 0;
        v.volume = Math.max(0, Math.min(1, c.volume));
        v.playbackRate = c.speed;
        if (this.playing) {
          if (v.paused) {
            v.currentTime = want;
            void v.play().catch(() => undefined);
          } else if (Math.abs(v.currentTime - want) > 0.25) v.currentTime = want;
        } else {
          if (!v.paused) v.pause();
          if (Math.abs(v.currentTime - want) > 0.02 && !v.seeking) v.currentTime = want;
        }
        if (v.readyState < 2) continue;
        el = v;
        sw = v.videoWidth;
        sh = v.videoHeight;
      } else if (a.kind === "image") {
        const img = this.imageFor(a);
        if (!img.complete || !img.naturalWidth) continue;
        el = img;
        sw = img.naturalWidth;
        sh = img.naturalHeight;
      } else continue;
      if (!sw || !sh) continue;
      this.drawMedia(el, sw, sh, c, L, W, H);
    }
    // Videos not on screen stop playing.
    for (const [id, v] of this.videos) if (!live.has(id) && !v.paused) v.pause();
  }

  private drawMedia(el: CanvasImageSource, sw: number, sh: number, c: MediaClip, L: ReturnType<typeof layersAt>[number], W: number, H: number) {
    const { ctx } = this;
    const tr = c.transform;
    const lw = W * tr.scale;
    const lh = H * tr.scale;
    ctx.save();
    ctx.globalAlpha = L.alpha;
    ctx.translate(W / 2 + tr.x * (W / 2) + L.slideX, H / 2 + tr.y * (H / 2) + L.slideY);
    if (tr.rotation) ctx.rotate((tr.rotation * Math.PI) / 180);
    let box = { x: -lw / 2, y: -lh / 2, w: lw, h: lh };
    if (L.motion) {
      const cover = fitRect(sw, sh, lw, lh, "cover").src;
      const m = motionRect(cover, L.motion.zoom, L.motion.dx, L.motion.dy);
      ctx.drawImage(el, m.x, m.y, m.w, m.h, box.x, box.y, box.w, box.h);
    } else if (c.fit === "blur") {
      const bg = fitRect(sw, sh, lw, lh, "cover");
      ctx.filter = `blur(${Math.round(24 * this.scale)}px) brightness(0.92)`;
      ctx.drawImage(el, bg.src.x, bg.src.y, bg.src.w, bg.src.h, bg.dst.x, bg.dst.y, bg.dst.w, bg.dst.h);
      ctx.filter = "none";
      const fg = fitRect(sw, sh, lw, lh, "contain");
      ctx.drawImage(el, fg.src.x, fg.src.y, fg.src.w, fg.src.h, fg.dst.x, fg.dst.y, fg.dst.w, fg.dst.h);
    } else {
      const r = fitRect(sw, sh, lw, lh, c.fit === "contain" ? "contain" : "cover");
      ctx.drawImage(el, r.src.x, r.src.y, r.src.w, r.src.h, r.dst.x, r.dst.y, r.dst.w, r.dst.h);
      box = r.dst;
    }
    if (L.black > 0) {
      ctx.globalAlpha = L.alpha * L.black;
      ctx.fillStyle = "#000";
      ctx.fillRect(box.x, box.y, box.w, box.h);
    }
    ctx.restore();
  }

  /** The current frame as an image (for a project thumbnail or a still). */
  snapshot(): string {
    return this.canvas.toDataURL("image/jpeg", 0.85);
  }
}

export const clipLabel = (c: Clip, assets: Map<string, Asset>) => (c.type === "text" ? c.text : (assets.get(c.assetId)?.name ?? "؟"));
