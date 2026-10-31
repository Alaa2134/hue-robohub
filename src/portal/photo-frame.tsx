"use client";
/**
 * /staff/photo-frame — hundreds of event photos into the BuildX frame at once, on the device (no AI,
 * nothing leaves the phone until it's uploaded). For each photo: where its subject is (detail, skin,
 * the middle), whether it fills the frame with a crop that keeps the subject or sits whole on a
 * blurred copy of itself (square and portrait photos), then levels, white balance, colour and a
 * little sharpening. From hundreds of shots it can keep only the good ones: blurry, too dark or
 * blown out, and near-identical burst shots (all but the sharpest) are left out, each one can be
 * put back. Then either up to the website's gallery as an album (small WebP files and
 * thumbnails), or down as a ZIP.
 */
import { useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/deploy";
import { FRAME, applyTone, bestCrop, fitMode, look, measureTone, pickBest, saliency, sharpen, type Look, type Verdict } from "@/lib/photo-frame";
import { batches } from "@/lib/share-files";
import { zipStore } from "@/lib/zip-store";
import { publicImageUrl } from "@/lib/site-content";
import { can, download, fmt, must, prepareImage, removeObjects, rpc, sb, sharePhotos, today, uploadImage, type StaffRow } from "./core";
import { Button, Card, Chip, Field, Icon, Input, Textarea, Toggle, TopBar, toast } from "./ui";

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

/** What a photo looks like (sharpness, brightness, a fingerprint), from a 160px copy. */
const looks = new WeakMap<File, Look | null>();
async function lookAt(file: File): Promise<Look | null> {
  if (looks.has(file)) return looks.get(file)!;
  let out: Look | null = null;
  try {
    const bmp = await createImageBitmap(file, { resizeWidth: 160, resizeQuality: "medium" }).catch(() => createImageBitmap(file));
    const w = 160,
      h = Math.max(8, Math.round((160 * bmp.height) / bmp.width));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true })!;
    x.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    out = look(x.getImageData(0, 0, w, h).data, w, h);
  } catch {
    /* unreadable: kept, and the run counts it */
  }
  looks.set(file, out);
  return out;
}

const WHY: Record<Exclude<Verdict, "keep">, string> = { duplicate: "مكررة", blurry: "مهزوزة", dark: "ضلمة", bright: "محروقة" };

const baseName = (f: File) => f.name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60) || "photo";

export function PhotoFrameScreen({ me }: { me: StaffRow }) {
  const admin = can(me, "publish");
  const [files, setFiles] = useState<File[]>([]);
  const [opts, setOpts] = useState<Opts>({ mode: "auto", enhance: true });
  const [previews, setPreviews] = useState<{ url: string; mode: string }[]>([]);
  const [album, setAlbum] = useState("");
  const [publish, setPublish] = useState(admin);
  const [job, setJob] = useState<{ what: "upload" | "zip" | "share"; done: number; failed: number; bytes: number } | null>(null);
  // Framed photos ready for the gallery / share sheet, and the words that go with them.
  const [ready, setReady] = useState<File[] | null>(null);
  const [words, setWords] = useState("");
  const [sent, setSent] = useState<Set<number>>(new Set());
  const stop = useRef(false);
  // Picking the good ones: what each photo looks like, read as they're added.
  const [cull, setCull] = useState(true);
  const [seen, setSeen] = useState<(Look | null | undefined)[]>([]);
  const [back, setBack] = useState<Set<File>>(new Set());
  const [showOut, setShowOut] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      const out: (Look | null | undefined)[] = files.map((f) => (looks.has(f) ? looks.get(f) : undefined));
      setSeen([...out]);
      for (let i = 0; i < files.length && live; i++) {
        if (out[i] !== undefined) continue;
        out[i] = await lookAt(files[i]);
        if (i % 8 === 7 || i === files.length - 1) live && setSeen([...out]);
      }
    })();
    return () => {
      live = false;
    };
  }, [files]);
  const verdicts = pickBest(seen.map((l) => l ?? null));
  const reading = seen.filter((l) => l === undefined).length;
  const left = cull ? files.map((f, i) => ({ f, i, why: verdicts[i] })).filter((x) => x.why && x.why !== "keep" && !back.has(x.f)) : [];
  const chosen = files.map((f, i) => i).filter((i) => !left.some((x) => x.i === i));

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
  const run = async (what: "upload" | "zip" | "share", each: (f: File, i: number, canvas: HTMLCanvasElement) => Promise<number>) => {
    stop.current = false;
    let done = 0,
      failed = 0,
      bytes = 0;
    setJob({ what, done, failed, bytes });
    const queue = chosen.map((i) => ({ f: files[i], i }));
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

  /** Frame them on the device; then each batch goes to the gallery or an app from its own tap. */
  const toShare = async () => {
    const out: { i: number; file: File }[] = [];
    const tag = (album.trim() || "buildx").replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40);
    try {
      const r = await run("share", async (_f, i, canvas) => {
        const b = await blobOf(canvas, "image/jpeg", 0.88);
        if (!b) throw new Error("encode");
        out.push({ i, file: new File([b], `${tag}-${String(i + 1).padStart(3, "0")}.jpg`, { type: "image/jpeg" }) });
        return b.size;
      });
      if (!out.length) return toast("مفيش صور اتعملت", "error");
      out.sort((a, b) => a.i - b.i);
      setReady(out.map((x) => x.file));
      setSent(new Set());
      toast(`${out.length} صورة جاهزة · ${fmt.size(r.bytes)}${r.failed ? ` · ${r.failed} ما اتقرتش` : ""}`, "ok");
    } catch (e) {
      toast.error(e);
    } finally {
      setJob(null);
    }
  };

  const shareBatch = async (n: number, list: File[]) => {
    const r = await sharePhotos(list, words.trim());
    if (r === "cancelled") return;
    setSent(new Set([...sent, n]));
    toast(r === "shared" ? "اتبعتوا ✓ (والكلام اتنسخ لو التطبيق ما خدهوش)" : `اتحفظ ${list.length} صورة على الجهاز${words.trim() ? " والكلام اتنسخ" : ""}`, "ok");
  };

  const total = files.reduce((n, f) => n + f.size, 0);
  return (
    <>
      {inner()}
      <ShrinkOld />
    </>
  );

  function inner() {
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

        {files.length > 1 && (
          <Card className="grid gap-2" data-testid="frame-cull">
            <Toggle checked={cull} onChange={setCull} label="اختار أحسن الصور تلقائي" hint="بيشيل المهزوزة والضلمة والمكررة (من كل لقطات ورا بعض بيسيب الأوضح)." />
            {cull && (
              <>
                <p className="text-sm text-mist" data-testid="frame-cull-sum">
                  {reading ? `بيبص على الصور… فاضل ${reading}` : `هيتعمل ${chosen.length} من ${files.length}`}
                  {left.length
                    ? ` · اتشال ${(Object.keys(WHY) as (keyof typeof WHY)[])
                        .map((k) => [k, left.filter((x) => x.why === k).length] as const)
                        .filter(([, n]) => n)
                        .map(([k, n]) => `${n} ${WHY[k]}`)
                        .join("، ")}`
                    : ""}
                </p>
                {left.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setShowOut(!showOut)}>
                    {showOut ? "خبّي اللي اتشال" : "شوف اللي اتشال"}
                  </Button>
                )}
                {showOut && (
                  <ul className="grid gap-1 text-sm" data-testid="frame-left-out">
                    {left.map((x) => (
                      <li key={x.i} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-mist">{x.f.name}</span>
                        <span className="text-xs text-warn">{WHY[x.why as keyof typeof WHY]}</span>
                        <Button size="sm" variant="ghost" onClick={() => setBack(new Set([...back, x.f]))}>
                          رجّعها
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Card>
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
                  <div className="h-full bg-cyan transition-all" style={{ width: `${Math.round((job.done / Math.max(1, chosen.length)) * 100)}%` }} />
                </div>
                <p className="text-sm text-mist">{`${job.done} من ${chosen.length}${job.failed ? ` · ${job.failed} ما اتقرتش` : ""} · ${fmt.size(job.bytes)}`}</p>
                <Button size="sm" onClick={() => (stop.current = true)}>
                  وقّف
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" icon="upload" onClick={() => void toSite()} data-testid="frame-upload">
                  {`ارفع ${chosen.length} على الموقع`}
                </Button>
                <Button icon="share" onClick={() => void toShare()} data-testid="frame-share">
                  للجاليري أو شارك على طول
                </Button>
                <Button icon="download" onClick={() => void toZip()} data-testid="frame-zip">
                  نزّلهم ZIP
                </Button>
                <Button variant="ghost" onClick={() => (setFiles([]), setBack(new Set()), setReady(null))}>
                  امسح الاختيار
                </Button>
              </div>
            )}
          </Card>
        )}

        {ready && (
          <Card className="grid gap-3" data-testid="frame-ready">
            <p className="font-semibold text-chalk">{`${ready.length} صورة في البرواز جاهزة`}</p>
            <Field label="الكلام اللي مع الصور (اختياري)" hint="بيتبعت مع الصور، وبيتنسخ كمان عشان لو التطبيق ما خدهوش تلزقه.">
              <Textarea rows={3} value={words} maxLength={2000} placeholder="مثلاً: لقطات من ورشة اليوم 📸 #BuildX" onChange={(e) => setWords(e.target.value)} data-testid="frame-words" />
            </Field>
            <div className="flex flex-wrap gap-2">
              {batches(ready).map((list, n) => (
                <Button key={n} variant={sent.has(n) ? "ghost" : "primary"} icon="share" onClick={() => void shareBatch(n, list)} data-testid={`frame-share-${n}`}>
                  {`${sent.has(n) ? "✓ " : ""}احفظ / شارك ${batches(ready).length > 1 ? `${n * 30 + 1}–${n * 30 + list.length}` : `الـ ${list.length}`}`}
                </Button>
              ))}
            </div>
            <p className="text-xs text-fog">من الموبايل: اختار «حفظ الصور» عشان تنزل الجاليري، أو واتساب/إنستجرام/فيسبوك على طول. من الكمبيوتر: بتتحفظ كل صورة لوحدها.</p>
          </Card>
        )}
      </div>
    </>
  );
  }
}

type Heavy = { id: string; path: string; size: number };

/**
 * The site's old photos (heavy JPEGs from iPhones) made light: each one re-encoded on this device,
 * saved under a new name, its content item pointed at it, then the old file removed. One at a time,
 * so a stop halfway leaves every photo working.
 */
function ShrinkOld() {
  const [list, setList] = useState<Heavy[] | null>(null);
  const [run, setRun] = useState<{ done: number; saved: number; failed: number } | null>(null);
  const stop = useRef(false);
  useEffect(() => {
    rpc<Heavy[]>("staff_heavy_site_images")
      .then((l) => setList(l ?? []))
      .catch(() => setList([]));
  }, []);
  if (!list?.length) return null;
  const total = list.reduce((n, x) => n + x.size, 0);

  const go = async () => {
    if (!confirm(`هتتصغّر ${list.length} صورة على الموقع (${fmt.size(total)}). الصورة بتفضل بنفس الشكل بس أخف، والملف القديم بيتمسح بعد ما الجديدة تتحفظ. نكمّل؟`)) return;
    stop.current = false;
    let done = 0,
      saved = 0,
      failed = 0;
    const left: Heavy[] = [];
    setRun({ done, saved, failed });
    for (const x of list) {
      if (stop.current) {
        left.push(x);
        continue;
      }
      try {
        const res = await fetch(publicImageUrl("site", x.path));
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        const light = await prepareImage(blob);
        // Not worth it (already light enough): leave it.
        if (light.main.size > x.size * 0.8) {
          left.push(x);
        } else {
          const up = await uploadImage("site", x.path.split("/").slice(0, -1).join("/") || "shrunk", blob);
          const rows = await sb().from("site_content").update({ image_path: up.path }).eq("id", x.id).eq("image_path", x.path).select("id").then(must);
          if (!rows?.length) {
            // The item changed meanwhile: drop the new copy, keep the old.
            await removeObjects([up.path], "site").catch(() => undefined);
            left.push(x);
          } else {
            await removeObjects([x.path], "site").catch(() => undefined);
            saved += x.size - up.after;
          }
        }
      } catch {
        failed++;
        left.push(x);
      }
      done++;
      setRun({ done, saved, failed });
    }
    toast(`اتصغّرت الصور: وفّرنا ${fmt.size(saved)}${failed ? ` · ${failed} ما اتعملتش` : ""}`, "ok");
    setList(left.filter((x) => x.size >= 320000));
    setRun(null);
  };

  return (
    <Card className="mt-4 grid gap-2" data-testid="shrink-old">
      <p className="font-semibold text-chalk">{`${list.length} صورة على الموقع تقيلة (${fmt.size(total)})`}</p>
      <p className="text-sm text-fog">اترفعت من الآيفون قبل التحديث. صغّرها بضغطة: بنفس الشكل والجودة اللي على الشاشة، وحجم أقل بكتير.</p>
      {run ? (
        <div className="grid gap-2">
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-cyan transition-all" style={{ width: `${Math.round((run.done / list.length) * 100)}%` }} />
          </div>
          <p className="text-sm text-mist">{`${run.done} من ${list.length} · وفّرنا ${fmt.size(run.saved)}${run.failed ? ` · ${run.failed} ما اتعملتش` : ""}`}</p>
          <Button size="sm" onClick={() => (stop.current = true)}>
            وقّف
          </Button>
        </div>
      ) : (
        <Button variant="primary" icon="image" onClick={() => void go()} data-testid="shrink-old-go">
          صغّرهم
        </Button>
      )}
    </Card>
  );
}
