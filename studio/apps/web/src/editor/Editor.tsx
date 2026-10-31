/** The editing workspace: media bin, preview, inspector, timeline; shortcuts; export. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addClip,
  appendClip,
  duplicateClip,
  findClip,
  newId,
  quickAssemble,
  removeClip,
  splitClip,
  visibleAt,
  type AssetInfo,
  type Clip,
  type TextClip,
} from "@studio/core";
import { api, fmtTime, type Asset, type Me, type Project, type ServerConfig } from "../api.ts";
import { Dialog, Icon, toast } from "../ui.tsx";
import { PreviewEngine } from "./engine.ts";
import { ExportPanel } from "./ExportPanel.tsx";
import { Inspector } from "./Inspector.tsx";
import { MediaBin } from "./MediaBin.tsx";
import { useEditor } from "./store.ts";
import { clipFromAsset, Timeline } from "./Timeline.tsx";

export function Editor({ id, cfg }: { id: string; cfg: ServerConfig; me: Me }) {
  const [project, setProject] = useState<Project | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    api<Project>("GET", `/projects/${id}`)
      .then(setProject)
      .catch((e: Error) => toast(e.message, "bad"));
  }, [id, n]);
  if (!project) return <div className="flex h-full items-center justify-center text-mute">جاري فتح المشروع…</div>;
  return <Workspace key={`${project.id}-${project.timelineVersion}-${n}`} project={project} cfg={cfg} reload={() => setN((x) => x + 1)} />;
}

function Workspace({ project, cfg, reload }: { project: Project; cfg: ServerConfig; reload: () => void }) {
  const store = useEditor(project, reload);
  const t = store.timeline;
  const [assets, setAssets] = useState<Asset[]>([]);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [auto, setAuto] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<PreviewEngine | null>(null);

  const loadAssets = useCallback(async () => {
    try {
      setAssets((await api<{ assets: Asset[] }>("GET", `/projects/${project.id}/assets`)).assets);
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  }, [project.id]);
  useEffect(() => void loadAssets(), [loadAssets]);
  // While files are being processed, check on them.
  const pending = assets.some((a) => a.status === "processing" || a.status === "uploading");
  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => void loadAssets(), 2000);
    return () => clearInterval(id);
  }, [pending, loadAssets]);

  const byId = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const info = useMemo(() => new Map<string, AssetInfo>(assets.map((a) => [a.id, { id: a.id, kind: a.kind, duration: a.duration, width: a.width, height: a.height, hasAudio: a.hasAudio }])), [assets]);

  useEffect(() => {
    engine.current = new PreviewEngine(canvas.current!, t, setTime);
    return () => engine.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => engine.current?.setTimeline(t), [t]);
  useEffect(() => engine.current?.setAssets(assets), [assets]);

  const seek = useCallback((s: number) => engine.current?.seek(s), []);
  const toggle = useCallback(() => {
    const e = engine.current!;
    if (e.playing) e.pause();
    else e.play();
    setPlaying(e.playing);
  }, []);
  useEffect(() => {
    const id = setInterval(() => setPlaying(!!engine.current?.playing), 250);
    return () => clearInterval(id);
  }, []);

  const sel = store.selected ? findClip(t, store.selected) : null;
  const frame = 1 / t.settings.fps;

  const split = useCallback(() => {
    const target = store.selected && findClip(t, store.selected) ? store.selected : visibleAt(t, time).at(-1)?.clip.id;
    if (!target) return;
    const r = splitClip(t, target, time);
    if (!r.right) return toast("حط المؤشر جوه الكليب عشان تقصه.");
    store.apply(r.timeline);
    store.setSelected(r.right);
  }, [store, t, time]);

  const addText = useCallback(() => {
    const track = t.tracks.filter((x) => x.kind === "video").at(-1)!;
    const c: TextClip = { id: newId("title"), type: "text", text: "عنوان", start: Math.round(time * 1000) / 1000, duration: 3, font: "Plex Arabic", size: 0.07, color: "#ffffff", box: null, weight: 700, align: "center", transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, fadeIn: 0.3, fadeOut: 0.3, style: "plain", subtitle: null, accent: "#45d0ff", animation: "none" };
    store.apply(addClip(t, track.id, c));
    store.setSelected(c.id);
  }, [store, t, time]);

  const addAsset = useCallback(
    (a: Asset) => {
      const track = t.tracks.find((x) => (a.kind === "audio" ? x.kind === "audio" : x.kind === "video") && !x.locked);
      if (!track) return;
      const { start: _s, ...rest } = clipFromAsset(a, 0);
      void _s;
      store.apply(appendClip(t, track.id, rest as Omit<Clip, "start">));
    },
    [store, t],
  );

  // Keyboard shortcuts (not while typing in a field).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.code === "Space") (e.preventDefault(), toggle());
      else if (mod && e.key.toLowerCase() === "z") (e.preventDefault(), e.shiftKey ? store.redo() : store.undo());
      else if (mod && e.key.toLowerCase() === "y") (e.preventDefault(), store.redo());
      else if (mod && e.key.toLowerCase() === "d" && store.selected) {
        e.preventDefault();
        const r = duplicateClip(t, store.selected);
        store.apply(r.timeline);
        store.setSelected(r.copy);
      } else if ((e.key === "s" || e.key === "S" || (mod && e.key.toLowerCase() === "k")) && !(mod && e.key.toLowerCase() === "s")) (e.preventDefault(), split());
      else if ((e.key === "Delete" || e.key === "Backspace") && store.selected) {
        e.preventDefault();
        store.apply(removeClip(t, store.selected, e.shiftKey));
        store.setSelected(null);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        seek(time + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 1 : frame));
      } else if (e.key === "Home") seek(0);
      else if (e.key === "End") seek(Infinity);
      else if (e.key === "t" || e.key === "T") (e.preventDefault(), addText());
      else if (mod && e.key.toLowerCase() === "s") (e.preventDefault(), void store.flush());
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [store, t, time, frame, toggle, seek, split, addText]);

  const saveLabel = { saved: "محفوظ", dirty: "تعديلات…", saving: "بيحفظ…", error: "ما اتحفظش" }[store.save];
  const aspect = t.settings.width / t.settings.height;

  return (
    <div className="flex h-full flex-col" data-testid="editor">
      <header className="flex items-center gap-2 border-b border-line bg-panel px-3 py-2">
        <a href="#/" className="btn btn-sm btn-icon" aria-label="المشاريع">
          <Icon name="back" size={16} />
        </a>
        <h1 className="truncate font-bold">{project.name}</h1>
        <span className={`text-xs ${store.save === "error" ? "text-bad" : "text-mute"}`} data-testid="save-state">
          {saveLabel}
        </span>
        <div className="flex-1" />
        <button className="btn btn-sm btn-icon" onClick={store.undo} disabled={!store.canUndo} title="تراجع (Ctrl+Z)" aria-label="تراجع" data-testid="undo">
          <Icon name="undo" size={16} />
        </button>
        <button className="btn btn-sm btn-icon" onClick={store.redo} disabled={!store.canRedo} title="إعادة (Ctrl+Shift+Z)" aria-label="إعادة" data-testid="redo">
          <Icon name="redo" size={16} />
        </button>
        <button className="btn btn-sm" onClick={split} title="قص عند المؤشر (S)" data-testid="split">
          <Icon name="cut" size={15} /> قص
        </button>
        <button
          className="btn btn-sm"
          disabled={!store.selected}
          onClick={() => {
            const r = duplicateClip(t, store.selected!);
            store.apply(r.timeline);
            store.setSelected(r.copy);
          }}
          title="نسخة (Ctrl+D)"
        >
          <Icon name="copy" size={15} />
        </button>
        <button
          className="btn btn-sm btn-danger"
          disabled={!store.selected}
          onClick={() => {
            store.apply(removeClip(t, store.selected!));
            store.setSelected(null);
          }}
          title="مسح (Del)"
          aria-label="مسح الكليب"
        >
          <Icon name="trash" size={15} />
        </button>
        <button className="btn btn-sm" onClick={addText} title="نص (T)" data-testid="add-text">
          <Icon name="text" size={15} /> نص
        </button>
        <button className="btn btn-sm btn-primary" onClick={() => setExporting(true)} disabled={!t.tracks.some((x) => x.clips.length)} data-testid="export">
          <Icon name="download" size={15} /> تصدير
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 border-e border-line bg-panel md:block">
          <MediaBin
            projectId={project.id}
            assets={assets}
            onChanged={() => void loadAssets()}
            onAdd={addAsset}
            onAuto={() => setAuto(true)}
            onDelete={async (a) => {
              try {
                await api("DELETE", `/projects/${project.id}/assets/${a.id}`);
                void loadAssets();
              } catch (e) {
                toast((e as Error).message, "bad");
              }
            }}
          />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col bg-ink">
          <div className="flex min-h-0 flex-1 items-center justify-center p-3">
            <canvas ref={canvas} className="max-h-full max-w-full rounded-md bg-black shadow-2xl" style={{ aspectRatio: String(aspect) }} data-testid="preview" />
          </div>
          <div className="flex items-center justify-center gap-2 pb-2" dir="ltr">
            <button className="btn btn-sm btn-icon" onClick={() => seek(time - frame)} aria-label="كادر لورا">
              <Icon name="prev" size={14} />
            </button>
            <button className="btn btn-icon" onClick={toggle} aria-label={playing ? "إيقاف" : "تشغيل"} data-testid="play">
              <Icon name={playing ? "pause" : "play"} />
            </button>
            <button className="btn btn-sm btn-icon" onClick={() => seek(time + frame)} aria-label="كادر لقدام">
              <Icon name="next" size={14} />
            </button>
            <span className="mono text-xs text-mute">{fmtTime(time, t.settings.fps)}</span>
          </div>
        </main>
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-s border-line bg-panel lg:block">
          <Inspector store={store} clip={sel?.clip ?? null} asset={sel?.clip.type === "media" ? byId.get(sel.clip.assetId) : undefined} />
        </aside>
      </div>
      <div className="h-[34%] min-h-[220px] border-t border-line">
        <Timeline store={store} assets={byId} info={info} time={time} onSeek={seek} />
      </div>

      {exporting && <ExportPanel cfg={cfg} projectId={project.id} name={project.name} flush={store.flush} onClose={() => setExporting(false)} />}
      {auto && (
        <AutoDialog
          onClose={() => setAuto(false)}
          onGo={(seconds, still) => {
            const visual = assets.filter((a) => a.status === "ready" && (a.kind === "video" || a.kind === "image"));
            // Videos and stills alternate, in upload order.
            const vids = visual.filter((a) => a.kind === "video");
            const pics = visual.filter((a) => a.kind === "image");
            const order: Asset[] = [];
            for (let i = 0; i < Math.max(vids.length, pics.length); i++) {
              if (vids[i]) order.push(vids[i]);
              if (pics[i * 2]) order.push(pics[i * 2]);
              if (pics[i * 2 + 1]) order.push(pics[i * 2 + 1]);
            }
            for (const p of pics.slice(Math.max(vids.length, 0) * 2)) if (!order.includes(p)) order.push(p);
            let next = quickAssemble(t, order.map((a) => info.get(a.id)!), { seconds, still });
            const song = assets.find((a) => a.status === "ready" && a.kind === "audio");
            const a1 = next.tracks.find((x) => x.kind === "audio");
            if (song && a1) {
              next = { ...next, tracks: next.tracks.map((x) => (x.id === a1.id ? { ...x, clips: [] } : x)) };
              next = addClip(next, a1.id, { ...clipFromAsset(song, 0), duration: Math.min(seconds, song.duration ?? seconds), volume: 0.8, fadeIn: 0.5, fadeOut: 2 } as Clip);
            }
            store.apply(next);
            seek(0);
            setAuto(false);
            toast(`اترصّ ${seconds} ثانية على التايملاين — عدّل براحتك.`, "ok");
          }}
        />
      )}
    </div>
  );
}

function AutoDialog({ onClose, onGo }: { onClose: () => void; onGo: (seconds: number, still: number) => void }) {
  const [seconds, setSeconds] = useState(30);
  const [still, setStill] = useState(2.5);
  return (
    <Dialog title="تجميع تلقائي" onClose={onClose}>
      <p className="mb-4 text-sm text-mute">بيرصّ الفيديوهات والصور بالتبادل (أحسن جزء من كل فيديو، والصور بحركة خفيفة وتداخل ناعم) والموسيقى تحت. شغل محلي — من غير AI ومن غير تكلفة. هيستبدل اللي على أول تراك فيديو.</p>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">الطول</span>
          <select className="field" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} data-testid="auto-seconds">
            {[15, 30, 45, 60, 90].map((s) => (
              <option key={s} value={s}>
                {s} ثانية
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">مدة الصورة</span>
          <select className="field" value={still} onChange={(e) => setStill(Number(e.target.value))}>
            {[1.5, 2, 2.5, 3, 4].map((s) => (
              <option key={s} value={s}>
                {s} ث
              </option>
            ))}
          </select>
        </label>
      </div>
      <button className="btn btn-primary w-full" onClick={() => onGo(seconds, still)} data-testid="auto-go">
        <Icon name="wand" size={16} /> رصّ
      </button>
      <p className="mt-2 text-center text-xs text-mute">{fmtTime(seconds)}</p>
    </Dialog>
  );
}
