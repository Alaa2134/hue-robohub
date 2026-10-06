"use client";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/brand/icons";
import { cn } from "@/lib/cn";

type Template = "event" | "achievement" | "recruit" | "stat";
type Size = "square" | "portrait" | "landscape";
const SIZES: Record<Size, { w: number; h: number; label: string }> = {
  square: { w: 1080, h: 1080, label: "Square 1080×1080" },
  portrait: { w: 1080, h: 1350, label: "Portrait 1080×1350" },
  landscape: { w: 1920, h: 1080, label: "Landscape 1920×1080" },
};
const ACCENTS = [
  ["Volt", "#2b6dff"],
  ["Cyan", "#38dcff"],
  ["Gold", "#e8b45c"],
  ["Line Follower", "#2F7BFF"],
  ["Sumo", "#FF3B4E"],
  ["Sprint", "#FF8A1F"],
  ["Autonomous", "#2ED47A"],
  ["Innovation", "#9B6BFF"],
] as const;

export type StudioArt = { name: string; url: string; thumb: string };
export type StudioPreset = { label: string; template: Template; kicker: string; title: string; details: string; cta: string; qr: string; big?: string };

type State = { template: Template; size: Size; lang: "en" | "ar"; kicker: string; title: string; details: string; cta: string; big: string; qr: string; art: string; accent: string; dim: number };

const fam = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || "sans-serif";

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const t = line ? `${line} ${word}` : word;
      if (ctx.measureText(t).width > maxW && line) {
        out.push(line);
        line = word;
      } else line = t;
    }
    out.push(line);
  }
  return out;
}

/** Fit text into maxW × maxLines by shrinking the font; returns lines + size. */
function fit(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, start: number, maxW: number, maxLines: number, min = 24) {
  for (let px = start; px >= min; px -= 2) {
    ctx.font = font(px);
    const lines = wrap(ctx, text, maxW);
    if (lines.length <= maxLines) return { lines, px };
  }
  ctx.font = font(min);
  return { lines: wrap(ctx, text, maxW).slice(0, maxLines), px: min };
}

const load = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });

async function render(canvas: HTMLCanvasElement, s: State, bg: HTMLImageElement | null, logo: HTMLImageElement | null) {
  const { w, h } = SIZES[s.size];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const ar = s.lang === "ar";
  const display = ar ? fam("--font-kufi") : fam("--font-saira");
  const body = ar ? fam("--font-plex-arabic") : fam("--font-inter");
  const mono = fam("--font-jbmono");
  const pad = Math.round(w * 0.07);
  const land = s.size === "landscape";

  // Background: key art cover-fit, then legibility gradients.
  ctx.fillStyle = "#03060c";
  ctx.fillRect(0, 0, w, h);
  if (bg) {
    const sc = Math.max(w / bg.naturalWidth, h / bg.naturalHeight);
    const dw = bg.naturalWidth * sc;
    const dh = bg.naturalHeight * sc;
    ctx.drawImage(bg, (w - dw) * (land ? 0.65 : 0.5), (h - dh) / 2, dw, dh);
  }
  const g = ctx.createLinearGradient(0, land ? 0 : h * 0.15, land ? w * 0.75 : 0, land ? 0 : h);
  g.addColorStop(0, `rgba(3,6,12,${0.15 + s.dim * 0.35})`);
  g.addColorStop(land ? 0.55 : 0.45, `rgba(3,6,12,${0.55 + s.dim * 0.3})`);
  g.addColorStop(1, `rgba(3,6,12,${0.9})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (land) {
    const g2 = ctx.createLinearGradient(0, 0, w, 0);
    g2.addColorStop(0, "rgba(3,6,12,0.85)");
    g2.addColorStop(0.6, "rgba(3,6,12,0.1)");
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, w, h);
  }

  // HUD frame: corner brackets + accent rail.
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 2;
  const c = Math.round(w * 0.035);
  const m = Math.round(w * 0.03);
  for (const [x, y, dx, dy] of [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]] as const) {
    ctx.beginPath();
    ctx.moveTo(x, y + dy * c);
    ctx.lineTo(x, y);
    ctx.lineTo(x + dx * c, y);
    ctx.stroke();
  }
  ctx.fillStyle = s.accent;
  ctx.fillRect(ar ? w - pad - 6 : pad, pad, 6, Math.round(h * 0.06));

  ctx.direction = ar ? "rtl" : "ltr";
  ctx.textAlign = ar ? "right" : "left";
  const x = ar ? w - pad : pad;
  const textW = land ? w * 0.52 : w - pad * 2;

  // Kicker
  let y = pad + Math.round(h * 0.06) + Math.round(w * 0.045);
  ctx.font = `600 ${Math.round(w * (land ? 0.014 : 0.024))}px ${mono}`;
  ctx.fillStyle = s.accent;
  const kicker = ar ? s.kicker : s.kicker.toUpperCase().split("").join(String.fromCharCode(8202));
  ctx.fillText(kicker, x, y);

  // Main block, bottom-anchored on portrait/square, mid-left on landscape.
  const big = s.template === "achievement" || s.template === "stat" ? s.big : "";
  const titleFont = (px: number) => `${ar ? 800 : 900} ${px}px ${display}`;
  const t = fit(ctx, ar ? s.title : s.title.toUpperCase(), titleFont, Math.round(w * (land ? 0.062 : 0.1)), textW, big ? 3 : 4, Math.round(w * 0.03));
  const lh = Math.round(t.px * (ar ? 1.25 : 1.02));
  ctx.font = `400 ${Math.round(w * (land ? 0.016 : 0.028))}px ${body}`;
  const details = wrap(ctx, s.details, textW).slice(0, 3);
  const dLh = Math.round(w * (land ? 0.024 : 0.04));
  const bigPx = Math.round(w * (land ? 0.11 : 0.2));
  const blockH = (big ? bigPx * 1.02 : 0) + t.lines.length * lh + (details.length ? 24 + details.length * dLh : 0);
  // Keep the text block clear of the QR code (bottom-right on portrait/square).
  const qrSizeEarly = Math.round(w * (land ? 0.09 : 0.16));
  const qrTop = h - pad - qrSizeEarly - Math.round(h * 0.06) - 8;
  const bottom = !land && s.qr ? qrTop - Math.round(h * 0.03) : h - pad - Math.round(h * 0.17);
  const kickerY = y;
  y = land ? Math.max(y + 40, (h - blockH) / 2 + bigPx * 0.4) : Math.max(kickerY + Math.round(h * 0.035), bottom - blockH);

  if (big) {
    ctx.font = `900 ${bigPx}px ${display}`;
    const grad = ctx.createLinearGradient(0, y, 0, y + bigPx);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(1, s.accent);
    ctx.fillStyle = grad;
    ctx.fillText(big, x, y + bigPx * 0.82);
    y += bigPx * 1.02;
  }
  ctx.fillStyle = "#f3f7fd";
  ctx.font = titleFont(t.px);
  for (const line of t.lines) {
    y += lh;
    ctx.fillText(line, x, y);
  }
  if (details.length) {
    y += 24;
    ctx.font = `400 ${Math.round(w * (land ? 0.016 : 0.028))}px ${body}`;
    ctx.fillStyle = "rgba(220,230,245,0.86)";
    for (const line of details) {
      y += dLh;
      ctx.fillText(line, x, y);
    }
  }

  // QR (real, programmatic) + CTA
  const qrSize = Math.round(w * (land ? 0.09 : 0.16));
  const footY = h - pad;
  if (s.qr) {
    const q = document.createElement("canvas");
    await QRCode.toCanvas(q, s.qr, { margin: 1, width: qrSize, errorCorrectionLevel: "M", color: { dark: "#03060c", light: "#ffffff" } });
    const qx = ar ? pad : w - pad - qrSize;
    const qy = footY - qrSize - Math.round(h * 0.06);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(qx - 8, qy - 8, qrSize + 16, qrSize + 16);
    ctx.drawImage(q, qx, qy, qrSize, qrSize);
  }
  if (s.cta) {
    ctx.font = `700 ${Math.round(w * (land ? 0.014 : 0.024))}px ${mono}`;
    ctx.fillStyle = s.accent;
    ctx.fillText(ar ? s.cta : s.cta.toUpperCase(), x, footY - Math.round(h * 0.07));
  }

  // Footer lockup
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(pad, footY - Math.round(h * 0.045), w - pad * 2, 1);
  const lh2 = Math.round(w * (land ? 0.022 : 0.036));
  if (logo) {
    const lw = (logo.naturalWidth / logo.naturalHeight) * lh2;
    ctx.drawImage(logo, ar ? w - pad - lw : pad, footY - lh2, lw, lh2);
  }
  ctx.font = `600 ${Math.round(w * (land ? 0.011 : 0.018))}px ${mono}`;
  ctx.fillStyle = "rgba(220,230,245,0.7)";
  ctx.textAlign = ar ? "left" : "right";
  ctx.direction = "ltr";
  ctx.fillText(`BUILD ${String.fromCharCode(8226)} INNOVATE ${String.fromCharCode(8226)} COMPETE`, ar ? pad : w - pad, footY - lh2 * 0.3);
}

export function Studio({ art, presets, joinUrl }: { art: StudioArt[]; presets: StudioPreset[]; joinUrl: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [s, setS] = useState<State>({ template: "recruit", size: "portrait", lang: "en", kicker: "Recruitment open", title: "Build real machines. Learn by doing. Compete to win.", details: "Embedded · Robotics · Mechanical · Software · Competition", cta: "Apply now", big: "", qr: joinUrl, art: art[0]?.url ?? "", accent: "#2b6dff", dim: 0.5 });
  const [upload, setUpload] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<State>) => setS((x) => ({ ...x, ...p }));

  useEffect(() => {
    let cancel = false;
    (async () => {
      const fams = [fam("--font-saira"), fam("--font-inter"), fam("--font-jbmono"), fam("--font-kufi"), fam("--font-plex-arabic")];
      await Promise.all(fams.map((f) => document.fonts.load(`700 40px ${f}`).catch(() => null)));
      const src = upload ?? s.art;
      const [bg, logo] = await Promise.all([src ? load(src).catch(() => null) : null, load("/brand/logo-horizontal-white.svg").catch(() => null)]);
      if (!cancel && canvas.current) await render(canvas.current, s, bg, logo);
    })();
    return () => {
      cancel = true;
    };
  }, [s, upload]);

  const download = () => {
    if (!canvas.current) return;
    setBusy(true);
    canvas.current.toBlob((b) => {
      setBusy(false);
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `robohub-${s.template}-${SIZES[s.size].w}x${SIZES[s.size].h}.png`;
      a.click();
    }, "image/png");
  };

  const input = "h-10 w-full rounded-lg border border-[var(--line-2)] bg-deep/70 px-3 text-sm text-chalk outline-none focus:border-cyan/60";
  const label = "flex flex-col gap-1.5 text-xs text-fog";

  return (
    <div className="grid gap-6 xl:grid-cols-[24rem_1fr]">
      <div className="flex flex-col gap-4">
        {presets.length > 0 && (
          <label className={label}>
            Start from
            <select
              className={input}
              defaultValue=""
              onChange={(e) => {
                const p = presets[Number(e.target.value)];
                if (p) set({ template: p.template, kicker: p.kicker, title: p.title, details: p.details, cta: p.cta, qr: p.qr, big: p.big ?? "" });
              }}
            >
              <option value="">Blank template…</option>
              {presets.map((p, i) => (
                <option key={i} value={i}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            Template
            <select className={input} value={s.template} onChange={(e) => set({ template: e.target.value as Template })}>
              <option value="recruit">Recruitment</option>
              <option value="event">Event</option>
              <option value="achievement">Achievement</option>
              <option value="stat">Big number</option>
            </select>
          </label>
          <label className={label}>
            Language
            <select className={input} value={s.lang} onChange={(e) => set({ lang: e.target.value as "en" | "ar" })}>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Size">
          {(Object.keys(SIZES) as Size[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={s.size === k} onClick={() => set({ size: k })} className={cn("rounded-lg border px-2 py-2 text-[0.7rem]", s.size === k ? "border-cyan/60 bg-cyan/10 text-chalk" : "border-[var(--line-2)] text-fog")}>
              {SIZES[k].label}
            </button>
          ))}
        </div>
        <label className={label}>
          Small heading
          <input className={input} value={s.kicker} maxLength={40} onChange={(e) => set({ kicker: e.target.value })} dir="auto" />
        </label>
        {(s.template === "achievement" || s.template === "stat") && (
          <label className={label}>
            Big text
            <input className={input} value={s.big} maxLength={10} placeholder={s.template === "stat" ? "120+" : "2ND"} onChange={(e) => set({ big: e.target.value })} dir="auto" />
          </label>
        )}
        <label className={label}>
          Title
          <textarea className={cn(input, "h-auto min-h-20 py-2")} value={s.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} dir="auto" />
        </label>
        <label className={label}>
          Details
          <textarea className={cn(input, "h-auto min-h-16 py-2")} value={s.details} maxLength={200} onChange={(e) => set({ details: e.target.value })} dir="auto" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            Call to action
            <input className={input} value={s.cta} maxLength={40} onChange={(e) => set({ cta: e.target.value })} dir="auto" />
          </label>
          <label className={label}>
            QR link (optional)
            <input className={input} value={s.qr} maxLength={300} placeholder="https://…" onChange={(e) => set({ qr: e.target.value })} dir="ltr" />
          </label>
        </div>
        <div className={label}>
          Accent
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map(([n, c]) => (
              <button key={n} type="button" title={n} aria-label={n} aria-pressed={s.accent === c} onClick={() => set({ accent: c })} className={cn("size-7 rounded-full border-2", s.accent === c ? "border-white" : "border-transparent")} style={{ background: c }} />
            ))}
          </div>
        </div>
        <div className={label}>
          Background
          <div className="grid grid-cols-4 gap-2">
            {art.map((a) => (
              <button key={a.name} type="button" onClick={() => (setUpload(null), set({ art: a.url }))} aria-label={a.name} className={cn("aspect-video overflow-hidden rounded-md border-2", !upload && s.art === a.url ? "border-cyan" : "border-transparent")}>
                <img src={a.thumb} alt="" className="size-full object-cover" loading="lazy" />
              </button>
            ))}
            <label className="flex aspect-video cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-[var(--line-2)] text-[0.65rem] text-fog hover:text-mist">
              Your photo
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && setUpload(URL.createObjectURL(e.target.files[0]))} />
            </label>
          </div>
        </div>
        <label className={label}>
          Darken background
          <input type="range" min={0} max={1} step={0.05} value={s.dim} onChange={(e) => set({ dim: Number(e.target.value) })} className="accent-[#2b6dff]" />
        </label>
      </div>
      <div className="flex min-w-0 flex-col items-center gap-4">
        <div className="w-full max-w-[44rem] overflow-hidden rounded-2xl border border-[var(--line-2)] bg-void shadow-2xl">
          <canvas ref={canvas} className="block h-auto w-full" aria-label="Poster preview" />
        </div>
        <button type="button" onClick={download} disabled={busy} className="btn btn-primary">
          <span aria-hidden className="btn-sheen" />
          <Icon name="arrow" size={15} className="rotate-90" />
          <span>Download PNG · {SIZES[s.size].w}×{SIZES[s.size].h}</span>
        </button>
        <p className="text-center text-xs text-fog">Rendered in your browser — nothing is uploaded. Uploaded photos stay on your device.</p>
      </div>
    </div>
  );
}
