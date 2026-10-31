/** Projects: create from a template or a size, rename, duplicate, delete. */
import { useCallback, useEffect, useState } from "react";
import { api, fmtTime, type Me, type ProjectSummary, type ServerConfig } from "./api.ts";
import { Dialog, go, Icon, toast } from "./ui.tsx";

const ASPECTS = [
  { v: "9:16", label: "ريلز / ستوري 9:16" },
  { v: "16:9", label: "يوتيوب 16:9" },
  { v: "1:1", label: "مربع 1:1" },
  { v: "4:5", label: "بوست 4:5" },
  { v: "custom", label: "مقاس مخصص" },
];

export function Dashboard({ cfg, me, onSignOut }: { cfg: ServerConfig; me: Me; onSignOut: () => void }) {
  const [list, setList] = useState<ProjectSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);

  const load = useCallback(async () => {
    try {
      setList((await api<{ projects: ProjectSummary[] }>("GET", "/projects")).projects);
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  }, []);
  useEffect(() => void load(), [load]);

  const used = Math.round(me.usage.renderSecondsThisMonth / 60);
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <header className="mb-8 flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-panel2 text-accent">
          <Icon name="play" />
        </span>
        <div className="me-auto">
          <h1 className="text-xl font-bold">BuildX AI Studio Pro</h1>
          <p className="text-xs text-mute">
            {me.email} · رصيد التصدير الشهر ده: {used} من {me.usage.renderMinutesLimit} دقيقة
          </p>
        </div>
        {me.role === "admin" && (
          <a className="btn" href="#/team">
            <Icon name="team" size={16} /> الفريق
          </a>
        )}
        <button className="btn" onClick={onSignOut}>
          <Icon name="logout" size={16} /> خروج
        </button>
        <button className="btn btn-primary" onClick={() => setCreating(true)} data-testid="new-project">
          <Icon name="plus" size={16} /> مشروع جديد
        </button>
      </header>

      {list === null ? (
        <p className="text-mute">جاري التحميل…</p>
      ) : list.length === 0 ? (
        <div className="card flex flex-col items-center p-10 text-center">
          <p className="mb-4 text-mute">مفيش مشاريع لسه. ابدأ بمشروع جديد وارفع فيديوهاتك وصورك.</p>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} /> مشروع جديد
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="projects">
          {list.map((p) => (
            <article key={p.id} className="card overflow-hidden" data-testid="project-card">
              <a href={`#/p/${p.id}`} className="block aspect-video bg-black/40">
                {p.thumb ? <img src={p.thumb} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full items-center justify-center text-mute"><Icon name="film" size={28} /></div>}
              </a>
              <div className="p-3">
                <a href={`#/p/${p.id}`} className="block truncate font-bold hover:text-accent">
                  {p.name}
                </a>
                <p className="mt-0.5 text-xs text-mute" dir="ltr">
                  {p.settings.width}×{p.settings.height} · {p.settings.fps} fps · {p.assets} files
                </p>
                <div className="mt-3 flex gap-1.5">
                  <button className="btn btn-sm" onClick={() => setRenaming(p)}>
                    اسم
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={async () => {
                      try {
                        await api("POST", `/projects/${p.id}/duplicate`);
                        toast("اتعملت نسخة.", "ok");
                        void load();
                      } catch (e) {
                        toast((e as Error).message, "bad");
                      }
                    }}
                  >
                    <Icon name="copy" size={14} /> نسخة
                  </button>
                  <button className="btn btn-sm btn-danger ms-auto" onClick={() => setDeleting(p)} aria-label="مسح">
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {creating && <NewProject cfg={cfg} onClose={() => setCreating(false)} />}
      {renaming && (
        <Rename
          p={renaming}
          onClose={() => setRenaming(null)}
          onDone={() => {
            setRenaming(null);
            void load();
          }}
        />
      )}
      {deleting && (
        <Dialog title="مسح المشروع؟" onClose={() => setDeleting(null)}>
          <p className="mb-4 text-sm text-mute">«{deleting.name}» وكل ملفاته وفيديوهاته المصدّرة هتتمسح من التخزين. مش هينفع ترجعه.</p>
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={() => setDeleting(null)}>
              لا
            </button>
            <button
              className="btn btn-primary"
              onClick={async () => {
                try {
                  await api("DELETE", `/projects/${deleting.id}`);
                  setDeleting(null);
                  void load();
                } catch (e) {
                  toast((e as Error).message, "bad");
                }
              }}
            >
              امسح
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function NewProject({ cfg, onClose }: { cfg: ServerConfig; onClose: () => void }) {
  const [name, setName] = useState("فيديو جديد");
  const [aspect, setAspect] = useState("9:16");
  const [resolution, setResolution] = useState("1080p");
  const [fps, setFps] = useState(30);
  const [w, setW] = useState(1080);
  const [h, setH] = useState(1920);
  const [template, setTemplate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title="مشروع جديد" onClose={onClose}>
      <label className="label" htmlFor="pname">
        الاسم
      </label>
      <input id="pname" className="field mb-4" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      <p className="label">قالب سريع</p>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {cfg.templates.map((t) => (
          <button
            key={t.id}
            className={`btn btn-sm ${template === t.id ? "border-accent text-accent" : ""}`}
            onClick={() => {
              setTemplate(t.id);
              setAspect(t.aspect);
              setFps(t.fps);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="aspect">
            المقاس
          </label>
          <select id="aspect" className="field" value={aspect} onChange={(e) => setAspect(e.target.value)}>
            {ASPECTS.map((a) => (
              <option key={a.v} value={a.v}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="res">
            الجودة
          </label>
          <select id="res" className="field" value={resolution} onChange={(e) => setResolution(e.target.value)} disabled={aspect === "custom"}>
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
            {cfg.limits.allow4k && <option value="2160p">4K</option>}
          </select>
        </div>
        {aspect === "custom" && (
          <>
            <div>
              <label className="label" htmlFor="cw">
                العرض
              </label>
              <input id="cw" className="field" type="number" min={144} max={4096} value={w} onChange={(e) => setW(Number(e.target.value))} />
            </div>
            <div>
              <label className="label" htmlFor="ch">
                الطول
              </label>
              <input id="ch" className="field" type="number" min={144} max={4096} value={h} onChange={(e) => setH(Number(e.target.value))} />
            </div>
          </>
        )}
        <div>
          <label className="label" htmlFor="fps">
            كادر في الثانية
          </label>
          <select id="fps" className="field" value={fps} onChange={(e) => setFps(Number(e.target.value))}>
            {[24, 25, 30, 60].map((f) => (
              <option key={f} value={f}>
                {f} fps
              </option>
            ))}
          </select>
        </div>
      </div>
      <button
        className="btn btn-primary w-full"
        disabled={busy || !name.trim()}
        data-testid="create-project"
        onClick={async () => {
          setBusy(true);
          try {
            const r = await api<{ id: string }>("POST", "/projects", { name, aspect, resolution, fps, width: w, height: h, template: template ?? undefined });
            go(`/p/${r.id}`);
          } catch (e) {
            toast((e as Error).message, "bad");
            setBusy(false);
          }
        }}
      >
        اعمل المشروع
      </button>
      <p className="mt-3 text-xs text-mute">أقصى طول للتصدير {fmtTime(cfg.limits.maxRenderSeconds)} · أقصى ملف {cfg.limits.maxUploadMb} MB</p>
    </Dialog>
  );
}

function Rename({ p, onClose, onDone }: { p: ProjectSummary; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(p.name);
  return (
    <Dialog title="تغيير الاسم" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("PATCH", `/projects/${p.id}`, { name });
            onDone();
          } catch (x) {
            toast((x as Error).message, "bad");
          }
        }}
      >
        <input className="field mb-4" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
        <button className="btn btn-primary w-full" disabled={!name.trim()}>
          حفظ
        </button>
      </form>
    </Dialog>
  );
}
