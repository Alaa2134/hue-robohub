"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/brand/icons";
import { prepareImage } from "@/lib/client-image";
import { cn } from "@/lib/cn";

type Crop = { x: number; y: number; w: number; h: number };
const ASPECT = 4 / 5;

/**
 * Member photo picker with drag-to-position and zoom inside a 4:5 portrait frame. Emits the crop as
 * normalised fractions of the original (cropX/Y/W/H); the server re-renders all renditions from it.
 */
export function PhotoCropper({ currentUrl, originalUrl, initialCrop, name = "photo" }: { currentUrl?: string | null; originalUrl?: string | null; initialCrop?: Crop | null; name?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [fw, setFw] = useState(280);
  const [z, setZ] = useState(1);
  const [t, setT] = useState({ x: 0, y: 0 });
  const [editing, setEditing] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ px: number; py: number; tx: number; ty: number } | null>(null);
  const fh = fw / ASPECT;

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFw(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [editing]);

  const s0 = nat ? Math.max(fw / nat.w, fh / nat.h) : 1;
  const s = s0 * z;
  const clamp = useCallback(
    (x: number, y: number, scale = s) => (nat ? { x: Math.min(0, Math.max(fw - nat.w * scale, x)), y: Math.min(0, Math.max(fh - nat.h * scale, y)) } : { x, y }),
    [nat, fw, fh, s],
  );

  const load = (url: string, crop?: Crop | null) => {
    const img = new Image();
    img.onload = () => {
      const n = { w: img.naturalWidth, h: img.naturalHeight };
      setNat(n);
      setSrc(url);
      const base = Math.max(fw / n.w, fh / n.h);
      if (crop) {
        const zoom = Math.max(1, fw / (crop.w * n.w * base));
        const sc = base * zoom;
        setZ(zoom);
        setT({ x: -crop.x * n.w * sc, y: -crop.y * n.h * sc });
      } else {
        setZ(1);
        setT({ x: (fw - n.w * base) / 2, y: (fh - n.h * base) * 0.3 });
      }
      setEditing(true);
    };
    img.src = url;
  };

  const pick = async (picked: File | undefined | null) => {
    if (!picked || !/^image\/(jpeg|png|webp|avif)$/.test(picked.type)) return;
    setBusy(true);
    const f = await prepareImage(picked);
    setBusy(false);
    if (input.current && input.current.files?.[0] !== f) {
      const dt = new DataTransfer();
      dt.items.add(f);
      input.current.files = dt.files;
    }
    setRemoved(false);
    load(URL.createObjectURL(f));
  };

  const setZoom = (nz: number) => {
    if (!nat) return;
    const zoom = Math.min(4, Math.max(1, nz));
    const ns = s0 * zoom;
    // zoom around the frame centre
    const cx = (fw / 2 - t.x) / s;
    const cy = (fh / 2 - t.y) / s;
    setZ(zoom);
    setT(clamp(fw / 2 - cx * ns, fh / 2 - cy * ns, ns));
  };

  const crop: Crop | null = nat && editing ? { x: -t.x / (nat.w * s), y: -t.y / (nat.h * s), w: fw / (nat.w * s), h: fh / (nat.h * s) } : null;

  return (
    <div className="flex flex-col gap-3">
      <input ref={input} type="file" name={name} accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" id="photo-input" onChange={(e) => pick(e.target.files?.[0])} />
      {crop && (
        <>
          <input type="hidden" name="cropX" value={crop.x.toFixed(5)} />
          <input type="hidden" name="cropY" value={crop.y.toFixed(5)} />
          <input type="hidden" name="cropW" value={crop.w.toFixed(5)} />
          <input type="hidden" name="cropH" value={crop.h.toFixed(5)} />
        </>
      )}
      {removed && <input type="hidden" name="removePhoto" value="1" />}

      <div
        ref={frame}
        className={cn("relative aspect-[4/5] w-full max-w-[18rem] touch-none select-none overflow-hidden rounded-2xl border border-[var(--line-2)] bg-deep", editing && "cursor-grab active:cursor-grabbing")}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files?.[0]);
        }}
        onPointerDown={(e) => {
          if (!editing) return;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          drag.current = { px: e.clientX, py: e.clientY, tx: t.x, ty: t.y };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setT(clamp(drag.current.tx + e.clientX - drag.current.px, drag.current.ty + e.clientY - drag.current.py));
        }}
        onPointerUp={() => (drag.current = null)}
        onWheel={(e) => {
          if (!editing) return;
          setZoom(z * (e.deltaY < 0 ? 1.06 : 0.94));
        }}
        tabIndex={editing ? 0 : -1}
        onKeyDown={(e) => {
          if (!editing) return;
          const step = e.shiftKey ? 30 : 8;
          if (e.key === "ArrowLeft") setT(clamp(t.x + step, t.y));
          else if (e.key === "ArrowRight") setT(clamp(t.x - step, t.y));
          else if (e.key === "ArrowUp") setT(clamp(t.x, t.y + step));
          else if (e.key === "ArrowDown") setT(clamp(t.x, t.y - step));
          else if (e.key === "+" || e.key === "=") setZoom(z * 1.1);
          else if (e.key === "-") setZoom(z / 1.1);
          else return;
          e.preventDefault();
        }}
        aria-label={editing ? "Photo position: drag or use arrow keys, +/- to zoom" : "Member photo"}
      >
        {busy ? (
          <p role="status" className="absolute inset-0 flex items-center justify-center text-sm text-fog">
            Preparing photo…
          </p>
        ) : editing && src && nat ? (
          <img src={src} alt="" draggable={false} className="pointer-events-none absolute max-w-none origin-top-left" style={{ width: nat.w, height: nat.h, transform: `translate(${t.x}px, ${t.y}px) scale(${s})` }} />
        ) : currentUrl && !removed ? (
          <img src={currentUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <label htmlFor="photo-input" className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-3 p-6 text-center text-sm text-fog transition-colors hover:text-mist">
            <span className="flex size-12 items-center justify-center rounded-xl border border-dashed border-[var(--line-2)]">
              <Icon name="image" size={22} />
            </span>
            Drop a photo here or click to upload
            <span className="text-xs text-steel">JPEG · PNG · WebP · AVIF — big phone photos are resized automatically</span>
          </label>
        )}
        {editing && (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-1/3 h-px bg-white/15" />
            <div className="absolute inset-x-0 top-2/3 h-px bg-white/15" />
            <div className="absolute inset-y-0 start-1/3 w-px bg-white/15" />
            <div className="absolute inset-y-0 start-2/3 w-px bg-white/15" />
          </div>
        )}
      </div>

      {editing && (
        <label className="flex max-w-[18rem] items-center gap-3 text-xs text-fog">
          Zoom
          <input type="range" min={1} max={4} step={0.01} value={z} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-[#2b6dff]" />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <label htmlFor="photo-input" className="btn btn-sm cursor-pointer">
          <Icon name="image" size={14} />
          <span>{currentUrl || editing ? "Replace photo" : "Upload photo"}</span>
        </label>
        {!editing && currentUrl && originalUrl && !removed && (
          <button type="button" className="btn btn-sm" onClick={() => load(originalUrl, initialCrop)}>
            <Icon name="target" size={14} />
            <span>Reposition</span>
          </button>
        )}
        {(currentUrl || editing) && !removed && (
          <button
            type="button"
            className="btn btn-sm text-danger"
            onClick={() => {
              setRemoved(true);
              setEditing(false);
              setSrc(null);
              if (input.current) input.current.value = "";
            }}
          >
            <Icon name="close" size={14} />
            <span>Remove</span>
          </button>
        )}
      </div>
    </div>
  );
}
