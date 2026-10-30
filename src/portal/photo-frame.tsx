"use client";
/**
 * /staff/photo-frame — hundreds of event photos into the BuildX frame at once, on the device (no AI,
 * nothing leaves the phone until it's uploaded). For each photo: where its subject is (detail, skin,
 * the middle), whether it fills the frame with a crop that keeps the subject or sits whole on a
 * blurred copy of itself (square and portrait photos), then levels, white balance, colour and a
 * little sharpening. Then either up to the website's gallery as an album (small WebP files and
 * thumbnails), or down as a ZIP.
 */
import { useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/deploy";
import { FRAME, applyTone, bestCrop, fitMode, measureTone, saliency, sharpen } from "@/lib/photo-frame";
import { zipStore } from "@/lib/zip-store";
import { can, download, fmt, must, removeObjects, sb, today, uploadImage, type StaffRow } from "./core";
import { Button, Card, Chip, Field, Icon, Input, Toggle, TopBar, toast } from "./ui";

const MAX = 500;
const PARALLEL = 2;
type Mode = "auto" | "fill" | "fit";
type Opts = { mode: Mode; enhance: boolean };

let frameImg: Promise<HTMLImageElement> | null = null;
const loadFrame = () =>
  (frameImg ??= new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => {
      frameImg = null;
      fail(new Error("frame"));
    };
    img.src = `${BASE_PATH}/brand/photo-frame.webp`;
  }));

const blobOf = (c: HTMLCanvasElement, type: string, q: number) => new Promise<Blob | null>((ok) => c.toBlob(ok, type, q));

/** One photo in the frame: a canvas the size of the frame, ready to encode. */
export async function frameCanvas(file: Blob, o: Opts): Promise<{ canvas: HTMLCanvasElement; mode: "fill" | "fit" }> {
  const [frame, bmp] = await Promise.all([loadFrame(), createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => createImageBitmap(file))]);
  try {
    const W = bmp.width,
      H = bmp.height;
    // A small copy to look at: where the subject is, and how the colours sit.
    const aw = 120,
      ah = Math.max(8, Math.round((aw * H) / W));
    const small = document.createElement("canvas");
    small.width = aw;
    small.height = ah;
    const sc = small.getContext("2d", { willReadFrequently: true })!;
    sc.drawImage(bmp, 0, 0, aw, ah);
    const px = sc.getImageData(0, 0, aw, ah).data;
    const mode = o.mode === "auto" ? fitMode(W, H) : o.mode;

    const out = document.createElement("canvas");
    out.width = FRAME.w;
    out.height = FRAME.h;
    const ctx = out.getContext("2d", { willReadFrequently: true })!;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#050b1d";
    ctx.fillRect(0, 0, FRAME.w, FRAME.h);
    // A few pixels under the frame's inner edge, so no gap shows.
    const h = { x: FRAME.hole.x - 6, y: FRAME.hole.y - 6, w: FRAME.hole.w + 12, h: FRAME.hole.h + 12 };
    if (mode === "fill") {
      const c = bestCrop(saliency(px, aw, ah), aw, ah, h.w / h.h);
      ctx.drawImage(bmp, c.x * W, c.y * H, c.w * W, c.h * H, h.x, h.y, h.w, h.h);
    } else {
      // The photo whole, on a soft blurred, darker copy of itself filling the window.
      const tiny = document.createElement("canvas");
      tiny.width = 32;
      tiny.height = Math.max(1, Math.round((32 * h.h) / h.w));
      const tc = tiny.getContext("2d")!;
      const s = Math.max(tiny.width / W, tiny.height / H);
      tc.drawImage(bmp, (tiny.width - W * s) / 2, (tiny.height - H * s) / 2, W * s, H * s);
      ctx.drawImage(tiny, h.x, h.y, h.w, h.h);
      ctx.fillStyle = "rgba(5, 11, 29, 0.45)";
      ctx.fillRect(h.x, h.y, h.w, h.h);
      const k = Math.min((FRAME.hole.w * 0.96) / W, (FRAME.hole.h * 0.94) / H);
      ctx.drawImage(bmp, FRAME.hole.x + (FRAME.hole.w - W * k) / 2, FRAME.hole.y + (FRAME.hole.h - H * k) / 2, W * k, H * k);
    }
    if (o.enhance) {
      const img = ctx.getImageData(h.x, h.y, h.w, h.h);
      applyTone(img.data, measureTone(px));
      sharpen(img.data, h.w, h.h, 0.35);
      ctx.putImageData(img, h.x, h.y);
    }
    ctx.drawImage(frame, 0, 0, FRAME.w, FRAME.h);
    return { canvas: out, mode };
  } finally {
    bmp.close();
  }
}

const baseName = (f: File) => f.name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60) || "photo";

export function PhotoFrameScreen({ me }: { me: StaffRow }) {
  const admin = can(me, "publish");
  const [files, setFiles] = useState<File[]>([]);
  const [opts, setOpts] = useState<Opts>({ mode: "auto", enhance: true });
  const [previews, setPreviews] = useState<{ url: string; mode: string }[]>([]);
  const [album, setAlbum] = useState("");
  const [publish, setPublish] = useState(admin);
  const [job, setJob] = useState<{ what: "upload" | "zip"; done: number; failed: number; bytes: number } | null>(null);
  const stop = useRef(false);

  // A look at the first few, redrawn when the options change.
  useEffect(() => {
    let live = true;
    const made: string[] = [];
    (async () => {
      const out: { url: string; mode: string }[] = [];
      for (const f of files.slice(0, 6)) {
        try {
          const { canvas, mode } = await frameCanvas(f, opts);
          const b = await blobOf(canvas, "image/jpeg", 0.8);
          if (!b || !live) return;
          const url = URL.createObjectURL(b);
          made.push(url);
          out.push({ url, mode });
          setPreviews([...out]);
        } catch {
          /* an unreadable file: the run below counts it */
        }
      }
    })();
    return () => {
      live = false;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [files, opts]);

  const add = (list: FileList | null) => {
    const picked = Array.from(list ?? []).filter((f) => f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
    setFiles((prev) => {
      const next = [...prev, ...picked];
      if (next.length > MAX) toast(`أقصى حد ${MAX} صورة في المرة`, "error");
      return next.slice(0, MAX);
    });
  };

  /** Each photo through the frame, two at a time; `each` gets each result as it's ready. */
  const run = async (what: "upload" | "zip", each: (f: File, i: number, canvas: HTMLCanvasElement) => Promise<number>) => {
    stop.current = false;
    let done = 0,
      failed = 0,
      bytes = 0;
    setJob({ what, done, failed, bytes });
    const queue = files.map((f, i) => ({ f, i }));
    const worker = async () => {
      for (let x = queue.shift(); x && !stop.current; x = queue.shift()) {
        try {
          const { canvas } = await frameCanvas(x.f, opts);
          bytes += await each(x.f, x.i, canvas);
        } catch {
          failed++;
        }
        done++;
        setJob({ what, done, failed, bytes });
        // Let the screen breathe between photos.
        await new Promise((r) => setTimeout(r, 0));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    return { done, failed, bytes };
  };

  const toSite = async () => {
    const name = album.trim();
    if (!name) return toast("اكتب اسم الألبوم", "error");
    const uploaded: { path: string; i: number }[] = [];
    const pub = admin ? { published: publish } : {};
    const rows = (list: { path: string; i: number }[]) =>
      list.map(({ path, i }) => ({ kind: "photo", title: "", image_path: path, tags: [name], starts_at: new Date(files[i].lastModified || Date.now()).toISOString(), ...pub }));
    let saved = 0;
    const flush = async (force = false) => {
      // Saved to the site 25 at a time, so a long run that stops halfway keeps what's up.
      while (uploaded.length - saved >= 25 || (force && uploaded.length > saved)) {
        const part = uploaded.slice(saved, saved + 25);
        await sb().from("site_content").insert(rows(part)).then(must);
        saved += part.length;
      }
    };
    try {
      const r = await run("upload", async (_f, i, canvas) => {
        const b = await blobOf(canvas, "image/jpeg", 0.92);
        if (!b) throw new Error("encode");
        const up = await uploadImage("site", me.user_id, b, { maxEdge: FRAME.w });
        uploaded.push({ path: up.path, i });
        await flush();
        return up.after;
      });
      await flush(true);
      toast(
        `${stop.current ? "اتوقف: " : ""}اترفع ${saved} صورة في ألبوم «${name}»${r.failed ? ` · ${r.failed} ما اتقرتش` : ""} · ${fmt.size(r.bytes)} كلهم${admin && publish ? "" : " (مسودة للمراجعة)"}`,
        "ok",
      );
      if (!stop.current) setFiles([]);
    } catch (e) {
      // What was uploaded but never saved to the gallery is removed.
      removeObjects(uploaded.slice(saved).map((u) => u.path), "site").catch(() => undefined);
      toast.error(e);
    } finally {
      setJob(null);
    }
  };

  const toZip = async () => {
    const entries: { name: string; data: Uint8Array }[] = [];
    try {
      const r = await run("zip", async (f, i, canvas) => {
        const b = await blobOf(canvas, "image/jpeg", 0.86);
        if (!b) throw new Error("encode");
        entries.push({ name: `${String(i + 1).padStart(3, "0")}-${baseName(f)}.jpg`, data: new Uint8Array(await b.arrayBuffer()) });
        return b.size;
      });
      if (!entries.length) return toast("مفيش صور اتعملت", "error");
      entries.sort((a, b) => a.name.localeCompare(b.name));
      download(zipStore(entries), `buildx-framed-${today()}.zip`);
      toast(`${entries.length} صورة في البرواز · ${fmt.size(r.bytes)}${r.failed ? ` · ${r.failed} ما اتقرتش` : ""}`, "ok");
    } catch (e) {
      toast.error(e);
    } finally {
      setJob(null);
    }
  };

  const total = files.reduce((n, f) => n + f.size, 0);
  return (
    <>
      <TopBar title="صور في البرواز" sub="لحد 500 صورة مرة واحدة: البرواز، الجودة، والحجم الصغير" back="/staff/site" />
      <div className="grid gap-4" data-testid="photo-frame">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--line-2)] bg-deep p-5 text-center">
          <Icon name="image" size={28} className="text-cyan" />
          <span className="font-semibold text-chalk">{files.length ? `${files.length} صورة (${fmt.size(total)}) · ضيف كمان` : "اختار الصور"}</span>
          <span className="text-xs text-fog">بيتعملوا على جهازك: الصورة العريضة بتملا البرواز وبيتقص منها الحتة المهمة، والطولية بتتحط كاملة على خلفية منها.</span>
          <input type="file" accept="image/*" multiple className="sr-only" disabled={!!job} data-testid="frame-photos" onChange={(e) => (add(e.target.files), (e.target.value = ""))} />
        </label>

        <Card className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["auto", "تلقائي (بيختار لكل صورة)"],
                ["fill", "املا البرواز"],
                ["fit", "الصورة كاملة"],
              ] as [Mode, string][]
            ).map(([k, label]) => (
              <Chip key={k} active={opts.mode === k} onClick={() => setOpts({ ...opts, mode: k })}>
                {label}
              </Chip>
            ))}
          </div>
          <Toggle checked={opts.enhance} onChange={(enhance) => setOpts({ ...opts, enhance })} label="حسّن الصورة" hint="الإضاءة، توازن الألوان، والحدة — بهدوء من غير ما يغيّر شكلها." />
        </Card>

        {previews.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2" data-testid="frame-previews">
            {previews.map((p, i) => (
              <figure key={i} className="overflow-hidden rounded-xl border border-[var(--line)]">
                <img src={p.url} alt="" className="w-full" />
                <figcaption className="px-2 py-1 text-xs text-fog">{p.mode === "fill" ? "مالية البرواز" : "كاملة على خلفية"}</figcaption>
              </figure>
            ))}
          </div>
        )}

        {files.length > 0 && (
          <Card className="grid gap-3">
            <Field label="اسم الألبوم على الموقع">
              <Input value={album} maxLength={80} placeholder="مثلاً: ورشة Embedded Systems" onChange={(e) => setAlbum(e.target.value)} data-testid="frame-album" />
            </Field>
            {admin ? (
              <Toggle checked={publish} onChange={setPublish} label="انشرهم على الموقع دلوقتي" hint="لو قفلته هيتحفظوا مسودة في «محتوى الموقع»." />
            ) : (
              <p className="text-sm text-fog">هيتحفظوا مسودة، واللي عنده صلاحية النشر هيراجعهم.</p>
            )}
            {job ? (
              <div className="grid gap-2" data-testid="frame-progress">
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-cyan transition-all" style={{ width: `${Math.round((job.done / files.length) * 100)}%` }} />
                </div>
                <p className="text-sm text-mist">{`${job.done} من ${files.length}${job.failed ? ` · ${job.failed} ما اتقرتش` : ""} · ${fmt.size(job.bytes)}`}</p>
                <Button size="sm" onClick={() => (stop.current = true)}>
                  وقّف
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" icon="upload" onClick={() => void toSite()} data-testid="frame-upload">
                  {`ارفع ${files.length} على الموقع`}
                </Button>
                <Button icon="download" onClick={() => void toZip()} data-testid="frame-zip">
                  نزّلهم ZIP
                </Button>
                <Button variant="ghost" onClick={() => setFiles([])}>
                  امسح الاختيار
                </Button>
              </div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
