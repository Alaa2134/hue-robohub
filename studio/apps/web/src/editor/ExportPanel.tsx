/** Export: pick size/fps/quality, see the length, the estimated time and what's left this month, then queue the render. */
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, fmtBytes, fmtTime, type Render, type ServerConfig } from "../api.ts";
import { Dialog, Icon, toast } from "../ui.tsx";

type Estimate = { duration: number; width: number; height: number; fps: number; quality: string; estimate: { cpuSeconds: number; wallSeconds: number }; quota: { secondsLeft: number; secondsLimit: number } };

const STATUS: Record<Render["status"], string> = { queued: "في الطابور", rendering: "بيترندر", uploading: "بيترفع", done: "جاهز", failed: "فشل", cancelled: "اتلغى" };

export function ExportPanel({ cfg, projectId, name, flush, onClose }: { cfg: ServerConfig; projectId: string; name: string; flush: () => Promise<number | null>; onClose: () => void }) {
  const [resolution, setResolution] = useState("project");
  const [fps, setFps] = useState<number | "project">("project");
  const [quality, setQuality] = useState("standard");
  const [est, setEst] = useState<Estimate | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [renders, setRenders] = useState<Render[]>([]);

  const body = useCallback(
    (version: number, estimateOnly: boolean) => ({ version, resolution, quality, fps: fps === "project" ? undefined : fps, name, estimateOnly }),
    [resolution, quality, fps, name],
  );

  const loadRenders = useCallback(async () => setRenders((await api<{ renders: Render[] }>("GET", `/projects/${projectId}/renders`)).renders), [projectId]);
  useEffect(() => void loadRenders().catch(() => undefined), [loadRenders]);
  const active = renders.some((r) => r.status === "queued" || r.status === "rendering" || r.status === "uploading");
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => void loadRenders().catch(() => undefined), 1500);
    return () => clearInterval(id);
  }, [active, loadRenders]);

  // The estimate updates with the choices (and saves the edit first, so it's what will render).
  useEffect(() => {
    let off = false;
    (async () => {
      setErr("");
      const v = await flush();
      if (v == null || off) return;
      try {
        const e = await api<Estimate>("POST", `/projects/${projectId}/renders`, body(v, true));
        if (!off) setEst(e);
      } catch (x) {
        if (!off) {
          setEst(null);
          setErr((x as Error).message);
        }
      }
    })();
    return () => {
      off = true;
    };
  }, [projectId, body, flush]);

  const start = async () => {
    setBusy(true);
    try {
      const v = await flush();
      if (v == null) throw new Error("التعديلات ما اتحفظتش.");
      await api<Render>("POST", `/projects/${projectId}/renders`, body(v, false));
      await loadRenders();
      toast("التصدير بدأ — تقدر تكمّل شغل.", "ok");
    } catch (x) {
      toast(x instanceof ApiError ? x.message : (x as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };

  const act = async (r: Render, what: "cancel" | "retry" | "download") => {
    try {
      if (what === "download") {
        const d = await api<{ url: string; name: string }>("GET", `/renders/${r.id}/download`);
        const a = document.createElement("a");
        a.href = d.url;
        a.download = d.name;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }
      await api("POST", `/renders/${r.id}/${what}`);
      await loadRenders();
    } catch (x) {
      toast((x as Error).message, "bad");
    }
  };

  return (
    <Dialog title="تصدير MP4" onClose={onClose} wide>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="label">الجودة</span>
              <select className="field" value={resolution} onChange={(e) => setResolution(e.target.value)} data-testid="export-resolution">
                <option value="project">زي المشروع</option>
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
                {cfg.limits.allow4k && <option value="2160p">4K</option>}
              </select>
            </label>
            <label className="block">
              <span className="label">FPS</span>
              <select className="field" value={fps} onChange={(e) => setFps(e.target.value === "project" ? "project" : Number(e.target.value))}>
                <option value="project">زي المشروع</option>
                {[24, 25, 30, 60].map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">الضغط</span>
              <select className="field" value={quality} onChange={(e) => setQuality(e.target.value)} data-testid="export-quality">
                <option value="draft">مسودة (أسرع)</option>
                <option value="standard">عادي</option>
                <option value="high">عالي (أبطأ)</option>
              </select>
            </label>
          </div>
          <div className="rounded-xl border border-line p-3 text-sm" data-testid="export-estimate">
            {est ? (
              <ul className="space-y-1">
                <li>
                  الطول: <b className="mono">{fmtTime(est.duration)}</b>
                </li>
                <li>
                  المقاس: <b className="mono" dir="ltr">{est.width}×{est.height} · {est.fps} fps · H.264 MP4</b>
                </li>
                <li>
                  الوقت المتوقع على السيرفر: <b className="mono">~{fmtTime(est.estimate.wallSeconds)}</b>
                </li>
                <li>
                  رصيدك الشهري بعد التصدير: <b className="mono">{Math.max(0, Math.floor((est.quota.secondsLeft - est.duration) / 60))} دقيقة</b> من {Math.round(est.quota.secondsLimit / 60)}
                </li>
                <li className="text-xs text-mute">بيترندر بـ FFmpeg على سيرفر الفريق — من غير أي تكلفة AI.</li>
              </ul>
            ) : err ? (
              <p className="text-bad">{err}</p>
            ) : (
              <p className="text-mute">بيحسب…</p>
            )}
          </div>
          <button className="btn btn-primary w-full" disabled={!est || busy || est.duration > est.quota.secondsLeft} onClick={() => void start()} data-testid="export-start">
            <Icon name="film" size={16} /> ابدأ التصدير
          </button>
        </div>
        <div>
          <p className="label">التصديرات</p>
          <div className="space-y-2" data-testid="renders">
            {!renders.length && <p className="text-sm text-mute">لسه مفيش.</p>}
            {renders.map((r) => (
              <div key={r.id} className="rounded-xl border border-line p-2.5 text-sm" data-testid="render" data-status={r.status}>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${r.status === "done" ? "text-ok" : r.status === "failed" ? "text-bad" : "text-accent"}`}>{STATUS[r.status]}</span>
                  <span className="mono text-xs text-mute" dir="ltr">
                    {r.settings.width}×{r.settings.height} · {r.settings.fps}fps · {fmtTime(r.duration)}
                    {r.size ? ` · ${fmtBytes(r.size)}` : ""}
                  </span>
                  {r.attempt > 1 && <span className="text-xs text-mute">محاولة {r.attempt}</span>}
                </div>
                {(r.status === "queued" || r.status === "rendering" || r.status === "uploading") && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded bg-white/10" role="progressbar" aria-valuenow={Math.round(r.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(r.progress * 100)}%` }} />
                  </div>
                )}
                {r.error && <p className="mt-1 text-xs text-bad">{r.error}</p>}
                <div className="mt-2 flex gap-1.5">
                  {r.status === "done" && (
                    <button className="btn btn-sm btn-primary" onClick={() => void act(r, "download")} data-testid="render-download">
                      <Icon name="download" size={14} /> تحميل
                    </button>
                  )}
                  {(r.status === "queued" || r.status === "rendering") && !r.cancelRequested && (
                    <button className="btn btn-sm" onClick={() => void act(r, "cancel")} data-testid="render-cancel">
                      إلغاء
                    </button>
                  )}
                  {(r.status === "failed" || r.status === "cancelled") && (
                    <button className="btn btn-sm" onClick={() => void act(r, "retry")} data-testid="render-retry">
                      إعادة المحاولة
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
