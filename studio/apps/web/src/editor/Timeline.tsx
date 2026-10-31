/**
 * The multi-track timeline: drag clips (also between tracks of the same kind), trim either edge,
 * snap to edges and the playhead, scrub on the ruler, drop files from the media bin. Video tracks are
 * drawn top-down from the highest layer, like other editors; time runs left to right.
 */
import { memo, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { end, moveClip, newId, snap, trimClip, type AssetInfo, type Clip, type Timeline as T, type Track } from "@studio/core";
import { fmtTime, type Asset } from "../api.ts";
import { Icon } from "../ui.tsx";
import type { EditorStore } from "./store.ts";

export function clipFromAsset(a: Asset, start: number): Clip {
  const d = a.kind === "image" ? 3 : Math.min(a.duration ?? 5, a.kind === "audio" ? 600 : 3600);
  return {
    id: newId("clip"),
    type: "media",
    assetId: a.id,
    start,
    duration: Math.max(0.1, Math.round(d * 1000) / 1000),
    in: 0,
    speed: 1,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    fit: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    motion: a.kind === "image" ? { from: { scale: 1, x: 0, y: 0 }, to: { scale: 1.12, x: 0, y: 0 } } : null,
    transitionIn: null,
  };
}

export const trackFits = (track: Track, a: Asset) => (a.kind === "audio" ? track.kind === "audio" : track.kind === "video");

type Drag = { mode: "move" | "start" | "end"; id: string; x0: number; base: T; start0: number; end0: number; moved: boolean };

export function Timeline({
  store,
  assets,
  info,
  time,
  onSeek,
}: {
  store: EditorStore;
  assets: Map<string, Asset>;
  info: Map<string, AssetInfo>;
  time: number;
  onSeek: (t: number) => void;
}) {
  const t = store.timeline;
  const [px, setPx] = useState(60);
  const [magnet, setMagnet] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const total = Math.max(...t.tracks.flatMap((x) => x.clips.map(end)), 0);
  const width = Math.max(800, (total + 20) * px);
  const order = [...t.tracks.filter((x) => x.kind === "video").reverse(), ...t.tracks.filter((x) => x.kind === "audio")];
  const timeAt = (clientX: number) => {
    const el = scroller.current!;
    return Math.max(0, (clientX - el.getBoundingClientRect().left + el.scrollLeft) / px);
  };
  const snapT = (v: number, ignore?: string) => (magnet ? snap(t, v, 8 / px, [time], ignore) : Math.round(v * 1000) / 1000);

  // Keep the playhead in view while playing.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const x = time * px;
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, x - 80);
  }, [time, px]);

  const onClipDown = (e: RPointerEvent, c: Clip, mode: Drag["mode"]) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    store.setSelected(c.id);
    const track = t.tracks.find((x) => x.clips.some((y) => y.id === c.id));
    if (track?.locked) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, id: c.id, x0: e.clientX, base: t, start0: c.start, end0: end(c), moved: false };
  };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dt = (e.clientX - d.x0) / px;
    if (!d.moved && Math.abs(e.clientX - d.x0) < 3) return;
    d.moved = true;
    if (d.mode === "move") {
      let s = d.start0 + dt;
      // Snap either edge.
      const len = d.end0 - d.start0;
      const a = snapT(s, d.id);
      const b = snapT(s + len, d.id) - len;
      s = Math.abs(a - s) <= Math.abs(b - s) ? a : b;
      const row = document.elementsFromPoint(e.clientX, e.clientY).find((el) => (el as HTMLElement).dataset?.track) as HTMLElement | undefined;
      store.apply(moveClip(d.base, d.id, Math.max(0, s), row?.dataset.track), { transient: true });
    } else {
      const v = snapT(d.mode === "start" ? d.start0 + dt : d.end0 + dt, d.id);
      store.apply(trimClip(d.base, d.id, d.mode, v, info), { transient: true });
    }
  };
  const onUp = () => {
    if (drag.current?.moved) store.commit();
    drag.current = null;
  };

  const step = [0.5, 1, 2, 5, 10, 15, 30, 60, 120].find((s) => s * px >= 64) ?? 300;
  const ticks = Array.from({ length: Math.ceil(width / px / step) + 1 }, (_, i) => i * step);

  return (
    <div className="flex h-full flex-col bg-panel" dir="ltr" data-testid="timeline">
      <div className="flex items-center gap-1.5 border-b border-line px-2 py-1.5">
        <span className="mono me-2 text-sm text-accent" data-testid="timecode">
          {fmtTime(time, t.settings.fps)}
        </span>
        <span className="mono text-xs text-mute">/ {fmtTime(total)}</span>
        <div className="flex-1" />
        <button className={`btn btn-sm btn-icon ${magnet ? "text-accent" : ""}`} onClick={() => setMagnet((m) => !m)} title="لزق على الحواف" aria-pressed={magnet}>
          <Icon name="magnet" size={15} />
        </button>
        <button className="btn btn-sm btn-icon" onClick={() => setPx((p) => Math.max(8, p / 1.4))} title="تصغير" aria-label="تصغير">
          <Icon name="zoomout" size={15} />
        </button>
        <input type="range" min={8} max={400} value={px} onChange={(e) => setPx(Number(e.target.value))} className="w-24" aria-label="زووم التايملاين" />
        <button className="btn btn-sm btn-icon" onClick={() => setPx((p) => Math.min(400, p * 1.4))} title="تكبير" aria-label="تكبير">
          <Icon name="zoomin" size={15} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-24 shrink-0 border-e border-line bg-panel">
          <div className="h-6 border-b border-line" />
          {order.map((tr) => (
            <div key={tr.id} className={`flex items-center gap-0.5 border-b border-line px-1.5 ${tr.kind === "video" ? "h-14" : "h-12"}`}>
              <span className="me-auto text-xs font-bold text-mute">{tr.name}</span>
              <button className={`rounded p-0.5 ${tr.muted ? "text-bad" : "text-mute hover:text-text"}`} onClick={() => store.apply((x) => ({ ...x, tracks: x.tracks.map((y) => (y.id === tr.id ? { ...y, muted: !y.muted } : y)) }))} title="كتم" aria-pressed={tr.muted}>
                <Icon name={tr.muted ? "mute" : "sound"} size={13} />
              </button>
              {tr.kind === "video" && (
                <button className={`rounded p-0.5 ${tr.hidden ? "text-bad" : "text-mute hover:text-text"}`} onClick={() => store.apply((x) => ({ ...x, tracks: x.tracks.map((y) => (y.id === tr.id ? { ...y, hidden: !y.hidden } : y)) }))} title="إخفاء" aria-pressed={tr.hidden}>
                  <Icon name={tr.hidden ? "eyeoff" : "eye"} size={13} />
                </button>
              )}
              <button className={`rounded p-0.5 ${tr.locked ? "text-warn" : "text-mute hover:text-text"}`} onClick={() => store.apply((x) => ({ ...x, tracks: x.tracks.map((y) => (y.id === tr.id ? { ...y, locked: !y.locked } : y)) }))} title="قفل" aria-pressed={tr.locked}>
                <Icon name="lock" size={13} />
              </button>
            </div>
          ))}
        </div>
        <div ref={scroller} className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <div style={{ width }} className="relative">
            <div
              className="relative h-6 cursor-ew-resize border-b border-line bg-panel2"
              data-testid="ruler"
              onPointerDown={(e) => {
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                onSeek(timeAt(e.clientX));
              }}
              onPointerMove={(e) => e.buttons === 1 && onSeek(timeAt(e.clientX))}
            >
              {ticks.map((s) => (
                <span key={s} className="mono absolute top-0 h-full border-s border-line ps-1 text-[10px] leading-6 text-mute" style={{ left: s * px }}>
                  {fmtTime(s)}
                </span>
              ))}
            </div>
            {order.map((tr) => (
              <div
                key={tr.id}
                data-track={tr.id}
                className={`relative border-b border-line ${tr.kind === "video" ? "h-14" : "h-12"} ${tr.locked ? "opacity-60" : ""}`}
                onPointerDown={(e) => {
                  if (e.target === e.currentTarget) {
                    store.setSelected(null);
                    onSeek(timeAt(e.clientX));
                  }
                }}
                onDragOver={(e) => e.dataTransfer.types.includes("application/x-studio-asset") && e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const a = assets.get(e.dataTransfer.getData("application/x-studio-asset"));
                  if (!a || a.status !== "ready" || !trackFits(tr, a) || tr.locked) return;
                  const c = clipFromAsset(a, snapT(timeAt(e.clientX)));
                  store.apply((x) => moveClip({ ...x, tracks: x.tracks.map((y) => (y.id === tr.id ? { ...y, clips: [...y.clips, c] } : y)) }, c.id, c.start));
                  store.setSelected(c.id);
                }}
                data-testid={`track-${tr.id}`}
              >
                {tr.clips.map((c) => (
                  <ClipBlock key={c.id} clip={c} track={tr} px={px} asset={c.type === "media" ? assets.get(c.assetId) : undefined} selected={store.selected === c.id} onDown={onClipDown} />
                ))}
              </div>
            ))}
            <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-accent" style={{ left: time * px }} data-testid="playhead">
              <div className="absolute -top-0 -left-1.5 h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-accent" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const ClipBlock = memo(function ClipBlock({ clip: c, track, px, asset, selected, onDown }: { clip: Clip; track: Track; px: number; asset?: Asset; selected: boolean; onDown: (e: RPointerEvent, c: Clip, mode: Drag["mode"]) => void }) {
  const w = Math.max(4, c.duration * px);
  const color = c.type === "text" ? "bg-[#4b3a8f]" : track.kind === "audio" ? "bg-[#1d4d3c]" : asset?.kind === "image" ? "bg-[#4a3a20]" : "bg-[#1f3c5c]";
  return (
    <div
      className={`group absolute top-1 bottom-1 overflow-hidden rounded-md border text-[11px] ${color} ${selected ? "border-accent ring-1 ring-accent" : "border-white/10"} cursor-grab active:cursor-grabbing`}
      style={{ left: c.start * px, width: w }}
      onPointerDown={(e) => onDown(e, c, "move")}
      data-testid="clip"
      data-clip={c.id}
      title={c.type === "text" ? c.text : asset?.name}
    >
      {c.type === "media" && asset?.thumb && track.kind === "video" && <div className="absolute inset-0 opacity-50" style={{ backgroundImage: `url(${asset.thumb})`, backgroundSize: "auto 100%", backgroundRepeat: "repeat-x" }} />}
      {c.type === "media" && asset?.waveform && (track.kind === "audio" || asset.kind === "video") && (
        <Wave peaks={asset.waveform} from={c.in} to={c.in + c.duration * c.speed} w={w} h={track.kind === "audio" ? 40 : 16} className={track.kind === "audio" ? "absolute inset-x-0 bottom-0" : "absolute inset-x-0 bottom-0 opacity-70"} />
      )}
      <span className="relative block truncate px-1.5 pt-0.5 font-bold drop-shadow">{c.type === "text" ? `T  ${c.text}` : (asset?.name ?? "")}</span>
      {c.type === "media" && c.transitionIn && c.transitionIn.kind !== "none" && <span className="absolute top-0 left-0 h-full bg-white/20" style={{ width: c.transitionIn.duration * px }} />}
      <span className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-white/0 group-hover:bg-white/30" onPointerDown={(e) => onDown(e, c, "start")} data-testid="trim-start" />
      <span className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-white/0 group-hover:bg-white/30" onPointerDown={(e) => onDown(e, c, "end")} data-testid="trim-end" />
    </div>
  );
});

const Wave = memo(function Wave({ peaks, from, to, w, h, className }: { peaks: number[]; from: number; to: number; w: number; h: number; className: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const width = Math.min(4000, Math.max(1, Math.round(w)));
    cv.width = width;
    cv.height = h;
    const g = cv.getContext("2d")!;
    g.clearRect(0, 0, width, h);
    g.fillStyle = "rgba(160, 255, 210, 0.75)";
    const a = Math.floor(from * 20);
    const b = Math.max(a + 1, Math.ceil(to * 20));
    for (let x = 0; x < width; x++) {
      const i0 = a + Math.floor(((b - a) * x) / width);
      const i1 = Math.max(i0 + 1, a + Math.floor(((b - a) * (x + 1)) / width));
      let m = 0;
      for (let i = i0; i < i1 && i < peaks.length; i++) m = Math.max(m, peaks[i]);
      const bh = Math.max(1, m * h);
      g.fillRect(x, (h - bh) / 2, 1, bh);
    }
  }, [peaks, from, to, w, h]);
  return <canvas ref={ref} className={className} style={{ width: w, height: h }} aria-hidden="true" />;
});
