/** Files in the project: upload (many at once, resumable), see their state, drag or add them to the timeline. */
import { useRef, useState } from "react";
import { fmtBytes, fmtTime, type Asset } from "../api.ts";
import { uploadFile, type UploadState } from "../upload.ts";
import { Icon, toast } from "../ui.tsx";

export function MediaBin({
  projectId,
  assets,
  onChanged,
  onAdd,
  onDelete,
  onAuto,
}: {
  projectId: string;
  assets: Asset[];
  onChanged: () => void;
  onAdd: (a: Asset) => void;
  onDelete: (a: Asset) => void;
  onAuto: () => void;
}) {
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<"all" | "video" | "image" | "audio">("all");

  const start = (files: FileList | File[]) => {
    const list = [...files];
    for (const f of list) {
      const id = `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 6)}`;
      setUploads((u) => [...u, { id, name: f.name, size: f.size, sent: 0, status: "uploading" }]);
      const up = uploadFile(projectId, f, (s) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, ...s } : x))));
      up.done
        .then(() => {
          setUploads((u) => u.filter((x) => x.id !== id));
          onChanged();
        })
        .catch((e: Error) => toast(`${f.name}: ${e.message}`, "bad"));
    }
  };

  const shown = assets.filter((a) => filter === "all" || a.kind === filter);
  return (
    <div
      className={`flex h-full flex-col ${over ? "bg-accent/5" : ""}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setOver(false);
        start(e.dataTransfer.files);
      }}
      data-testid="media-bin"
    >
      <div className="flex items-center gap-1.5 border-b border-line p-2">
        <button className="btn btn-sm btn-primary" onClick={() => input.current?.click()}>
          <Icon name="upload" size={14} /> رفع
        </button>
        <button className="btn btn-sm" onClick={onAuto} disabled={!assets.some((a) => a.status === "ready" && (a.kind === "video" || a.kind === "image"))} title="يرصّ الملفات على التايملاين لوحده (من غير AI، ومن غير تكلفة)">
          <Icon name="wand" size={14} /> تجميع تلقائي
        </button>
        <input ref={input} type="file" multiple hidden accept="video/*,image/*,audio/*,.mov,.mkv,.m4a" onChange={(e) => e.target.files && (start(e.target.files), (e.target.value = ""))} data-testid="upload-input" />
      </div>
      <div className="flex gap-1 border-b border-line px-2 py-1.5 text-xs">
        {(["all", "video", "image", "audio"] as const).map((k) => (
          <button key={k} className={`rounded-md px-2 py-0.5 ${filter === k ? "bg-panel2 text-accent" : "text-mute"}`} onClick={() => setFilter(k)}>
            {{ all: "الكل", video: "فيديو", image: "صور", audio: "صوت" }[k]} ({k === "all" ? assets.length : assets.filter((a) => a.kind === k).length})
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {uploads.map((u) => (
          <div key={u.id} className="mb-2 rounded-lg border border-line p-2 text-xs" data-testid="upload-row">
            <p className="truncate">{u.name}</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded bg-white/10">
              <div className={`h-full ${u.status === "error" ? "bg-bad" : "bg-accent"}`} style={{ width: `${Math.round((u.sent / u.size) * 100)}%` }} />
            </div>
            <p className="mt-1 text-mute">{u.status === "error" ? u.error : u.status === "processing" ? "بيتجهز…" : `${fmtBytes(u.sent)} / ${fmtBytes(u.size)}`}</p>
          </div>
        ))}
        {!assets.length && !uploads.length && (
          <button className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-line p-6 text-sm text-mute" onClick={() => input.current?.click()}>
            <Icon name="upload" size={22} />
            اسحب الفيديوهات والصور والموسيقى هنا
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          {shown.map((a) => (
            <div
              key={a.id}
              className="group relative overflow-hidden rounded-lg border border-line bg-panel2"
              draggable={a.status === "ready"}
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-studio-asset", a.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              data-testid="asset"
              data-status={a.status}
              data-kind={a.kind}
            >
              <div className="relative aspect-video bg-black/40">
                {a.thumb ? <img src={a.thumb} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} /> : <div className="flex h-full items-center justify-center text-mute"><Icon name={a.kind === "audio" ? "music" : a.kind === "image" ? "image" : "film"} size={20} /></div>}
                {a.duration != null && <span className="mono absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[10px]">{fmtTime(a.duration)}</span>}
                {a.status !== "ready" && (
                  <span className={`absolute inset-0 flex items-center justify-center bg-black/60 text-[11px] ${a.status === "failed" ? "text-bad" : "text-mute"}`}>{a.status === "failed" ? "فشل" : a.status === "uploading" ? "بيترفع…" : "بيتجهز…"}</span>
                )}
                {a.status === "ready" && (
                  <button className="absolute top-1 right-1 rounded-md bg-black/70 p-1 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => onAdd(a)} title="ضيف على التايملاين" aria-label={`ضيف ${a.name}`} data-testid="asset-add">
                    <Icon name="plus" size={14} />
                  </button>
                )}
                <button className="absolute top-1 left-1 rounded-md bg-black/70 p-1 text-bad opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => onDelete(a)} title="مسح" aria-label={`مسح ${a.name}`}>
                  <Icon name="trash" size={13} />
                </button>
              </div>
              <p className="truncate px-1.5 py-1 text-[11px]" title={a.error ?? a.name}>
                {a.name}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
