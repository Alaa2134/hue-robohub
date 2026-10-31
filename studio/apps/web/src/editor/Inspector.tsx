/** Properties of the selected clip (or the project when nothing is selected). */
import { FONTS, TRANSITIONS, updateClip, type Clip, type MediaClip, type Motion, type TextClip } from "@studio/core";
import { fmtTime, type Asset } from "../api.ts";
import type { EditorStore } from "./store.ts";

const MOTIONS: { id: string; label: string; m: Motion | null }[] = [
  { id: "none", label: "ثابت", m: null },
  { id: "in", label: "زووم داخل", m: { from: { scale: 1, x: 0, y: 0 }, to: { scale: 1.15, x: 0, y: 0 } } },
  { id: "out", label: "زووم خارج", m: { from: { scale: 1.15, x: 0, y: 0 }, to: { scale: 1, x: 0, y: 0 } } },
  { id: "left", label: "تحريك شمال", m: { from: { scale: 1.12, x: 0.08, y: 0 }, to: { scale: 1.12, x: -0.08, y: 0 } } },
  { id: "right", label: "تحريك يمين", m: { from: { scale: 1.12, x: -0.08, y: 0 }, to: { scale: 1.12, x: 0.08, y: 0 } } },
  { id: "up", label: "تحريك لفوق", m: { from: { scale: 1.12, x: 0, y: 0.08 }, to: { scale: 1.12, x: 0, y: -0.08 } } },
];
const TR_LABEL: Record<string, string> = { none: "من غير", fade: "ظهور من الأسود", crossfade: "تداخل ناعم", dip: "غمقة للأسود", "slide-left": "دخول من اليمين", "slide-up": "دخول من تحت" };

function Num({ label, value, min, max, step = 0.1, onChange, suffix }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <label className="block">
      <span className="label flex justify-between">
        <span>{label}</span>
        <span className="mono">
          {Math.round(value * 100) / 100}
          {suffix}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </label>
  );
}

export function Inspector({ store, clip, asset }: { store: EditorStore; clip: Clip | null; asset?: Asset }) {
  const t = store.timeline;
  if (!clip) {
    const s = t.settings;
    return (
      <div className="space-y-4 p-3 text-sm">
        <h3 className="font-bold">المشروع</h3>
        <p className="mono text-xs text-mute" dir="ltr">
          {s.width}×{s.height} · {s.fps} fps
        </p>
        <label className="block">
          <span className="label">لون الخلفية</span>
          <input type="color" value={s.background} onChange={(e) => store.apply({ ...t, settings: { ...s, background: e.target.value } })} className="h-9 w-full rounded-lg border border-line bg-transparent" />
        </label>
        <label className="block">
          <span className="label">كادر في الثانية</span>
          <select className="field" value={s.fps} onChange={(e) => store.apply({ ...t, settings: { ...s, fps: Number(e.target.value) as 24 | 25 | 30 | 60 } })}>
            {[24, 25, 30, 60].map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <div className="rounded-lg border border-line p-2 text-xs leading-6 text-mute">
          <p className="mb-1 font-bold text-text">اختصارات</p>
          <p><span className="kbd">Space</span> تشغيل/إيقاف · <span className="kbd">S</span> قص عند المؤشر</p>
          <p><span className="kbd">Del</span> مسح · <span className="kbd">Shift+Del</span> مسح وسحب الباقي</p>
          <p><span className="kbd">Ctrl+D</span> نسخة · <span className="kbd">Ctrl+Z</span> تراجع · <span className="kbd">Ctrl+Shift+Z</span> إعادة</p>
          <p><span className="kbd">← →</span> كادر · <span className="kbd">Shift+← →</span> ثانية · <span className="kbd">T</span> نص</p>
        </div>
      </div>
    );
  }
  const set = (patch: Partial<MediaClip> | Partial<TextClip>) => store.apply(updateClip(t, clip.id, patch as Partial<Clip>));
  const tr = clip.transform;
  const setT = (p: Partial<typeof tr>) => set({ transform: { ...tr, ...p } });
  return (
    <div className="space-y-3 p-3 text-sm" data-testid="inspector">
      <h3 className="truncate font-bold">{clip.type === "text" ? "نص" : (asset?.name ?? "كليب")}</h3>
      <p className="mono text-xs text-mute" dir="ltr">
        {fmtTime(clip.start, t.settings.fps)} → {fmtTime(clip.start + clip.duration, t.settings.fps)} ({clip.duration.toFixed(2)}s)
      </p>
      {clip.type === "text" ? (
        <>
          <label className="block">
            <span className="label">الكلام</span>
            <textarea className="field h-20 py-1.5" value={clip.text} maxLength={500} onChange={(e) => e.target.value.trim() && set({ text: e.target.value })} dir="auto" data-testid="text-input" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="label">الخط</span>
              <select className="field" value={clip.font} onChange={(e) => set({ font: e.target.value })}>
                {Object.keys(FONTS).map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">اللون</span>
              <input type="color" value={clip.color} onChange={(e) => set({ color: e.target.value })} className="h-9 w-full rounded-lg border border-line bg-transparent" />
            </label>
          </div>
          <Num label="الحجم" value={clip.size} min={0.02} max={0.2} step={0.005} onChange={(v) => set({ size: v })} />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={!!clip.box} onChange={(e) => set({ box: e.target.checked ? "#000000aa" : null })} /> خلفية ورا الكلام
          </label>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="label">الملء</span>
              <select className="field" value={clip.fit} onChange={(e) => set({ fit: e.target.value as MediaClip["fit"] })}>
                <option value="cover">ملء الكادر</option>
                <option value="contain">كامل جوه الكادر</option>
                <option value="blur">كامل + خلفية ضبابية</option>
              </select>
            </label>
            <label className="block">
              <span className="label">الحركة</span>
              <select className="field" value={MOTIONS.find((m) => JSON.stringify(m.m) === JSON.stringify(clip.motion))?.id ?? "none"} onChange={(e) => set({ motion: MOTIONS.find((m) => m.id === e.target.value)?.m ?? null })}>
                {MOTIONS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="label">الانتقال للكليب ده</span>
              <select className="field" value={clip.transitionIn?.kind ?? "none"} onChange={(e) => set({ transitionIn: e.target.value === "none" ? null : { kind: e.target.value as never, duration: clip.transitionIn?.duration ?? 0.5 } })} data-testid="transition">
                {TRANSITIONS.map((k) => (
                  <option key={k} value={k}>
                    {TR_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            {clip.transitionIn && <Num label="مدته" value={clip.transitionIn.duration} min={0.1} max={2} onChange={(v) => set({ transitionIn: { ...clip.transitionIn!, duration: v } })} suffix="s" />}
          </div>
          {asset?.kind === "video" && <Num label="السرعة" value={clip.speed} min={0.25} max={4} step={0.05} onChange={(v) => set({ speed: v })} suffix="×" />}
          {(asset?.kind === "audio" || asset?.hasAudio) && <Num label="الصوت" value={clip.volume} min={0} max={2} step={0.05} onChange={(v) => set({ volume: v })} />}
        </>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Num label="ظهور" value={clip.fadeIn} min={0} max={3} onChange={(v) => set({ fadeIn: v })} suffix="s" />
        <Num label="اختفاء" value={clip.fadeOut} min={0} max={3} onChange={(v) => set({ fadeOut: v })} suffix="s" />
      </div>
      {!(clip.type === "media" && asset?.kind === "audio") && (
        <details className="rounded-lg border border-line p-2" open={clip.type === "text"}>
          <summary className="cursor-pointer text-xs text-mute">المكان والحجم</summary>
          <div className="mt-2 space-y-2">
            <Num label="الحجم" value={tr.scale} min={0.1} max={3} step={0.01} onChange={(v) => setT({ scale: v })} suffix="×" />
            <Num label="أفقي" value={tr.x} min={-1} max={1} step={0.01} onChange={(v) => setT({ x: v })} />
            <Num label="رأسي" value={tr.y} min={-1} max={1} step={0.01} onChange={(v) => setT({ y: v })} />
            <Num label="دوران" value={tr.rotation} min={-180} max={180} step={1} onChange={(v) => setT({ rotation: v })} suffix="°" />
            <Num label="الشفافية" value={tr.opacity} min={0} max={1} step={0.01} onChange={(v) => setT({ opacity: v })} />
          </div>
        </details>
      )}
    </div>
  );
}
