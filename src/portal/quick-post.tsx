"use client";
/**
 * Quick post: one screen to put something on the website from a phone — a news post, a project,
 * an achievement, or just photos. Pick photos (the first is the cover; the rest go to the gallery in
 * an album named after the post), a title and a few lines, and publish. The full editor is still
 * there for everything else (English, links, scheduling…).
 */
import { useEffect, useState } from "react";
import type { ContentKind } from "@/lib/site-content";
import { can, must, removeObjects, sb, uid, uploadImage, type StaffRow } from "./core";
import { Button, Chip, Field, Icon, Input, Sheet, Textarea, Toggle, toast } from "./ui";

type QuickKind = "post" | "project" | "achievement" | "photo";
const KINDS: { k: QuickKind; label: string; title: string; body: string }[] = [
  { k: "post", label: "خبر", title: "العنوان", body: "إيه اللي حصل؟" },
  { k: "project", label: "مشروع", title: "اسم المشروع", body: "المشروع بيعمل إيه؟ واتعمل إزاي؟" },
  { k: "achievement", label: "إنجاز", title: "اسم المسابقة / الإنجاز", body: "كلمتين عن الإنجاز" },
  { k: "photo", label: "صور بس", title: "اسم الألبوم", body: "" },
];
const MAX = 20;
const PARALLEL = 3;

/** The first sentence (or the first 200 characters) of the text, for the card on the site. */
export function firstLine(text: string) {
  const t = text.trim().replace(/\s+/g, " ");
  const end = t.search(/[.!؟?\n]/);
  const s = end > 20 ? t.slice(0, end + 1) : t;
  return s.length > 200 ? `${s.slice(0, 197).trimEnd()}…` : s;
}

export type QuickPrefill = { kind?: QuickKind; title?: string; body?: string };

export function QuickPost({ me, prefill, onClose, onDone }: { me: StaffRow; prefill?: QuickPrefill; onClose: () => void; onDone: () => void }) {
  const admin = can(me, "publish");
  const [kind, setKind] = useState<QuickKind>(prefill?.kind ?? "post");
  const [title, setTitle] = useState(prefill?.title ?? "");
  const [body, setBody] = useState(prefill?.body ?? "");
  const [result, setResult] = useState("");
  const [files, setFiles] = useState<{ id: string; file: File; url: string }[]>([]);
  const [publish, setPublish] = useState(admin);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const k = KINDS.find((x) => x.k === kind)!;

  useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (list: FileList | null) => {
    const picked = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...picked.map((file) => ({ id: uid(), file, url: URL.createObjectURL(file) }))].slice(0, MAX));
  };
  const drop = (id: string) =>
    setFiles((prev) => {
      const f = prev.find((x) => x.id === id);
      if (f) URL.revokeObjectURL(f.url);
      return prev.filter((x) => x.id !== id);
    });
  const cover = (id: string) => setFiles((prev) => [...prev.filter((x) => x.id === id), ...prev.filter((x) => x.id !== id)]);

  const send = async () => {
    const name = title.trim();
    if (kind === "photo" ? !files.length : !name) return toast(kind === "photo" ? "اختار صور" : `اكتب ${k.title}`, "error");
    if (kind !== "photo" && kind !== "achievement" && !body.trim()) return toast("اكتب سطرين عن اللي حصل", "error");
    setBusy(true);
    setProgress(0);
    const paths: string[] = new Array(files.length);
    let done = 0;
    try {
      // Compressed on the phone (WebP + thumbnail), three at a time, kept in the order picked.
      const queue = files.map((f, i) => ({ f, i }));
      const worker = async () => {
        for (let x = queue.shift(); x; x = queue.shift()) {
          paths[x.i] = (await uploadImage("site", me.user_id, x.f.file, { maxEdge: 1800 })).path;
          setProgress(++done / files.length);
        }
      };
      await Promise.all(Array.from({ length: PARALLEL }, worker));
    } catch (e) {
      removeObjects(paths.filter(Boolean), "site").catch(() => undefined);
      setBusy(false);
      return toast.error(e);
    }
    const now = new Date().toISOString();
    const album = name || `صور ${new Date().toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" })}`;
    const pub = admin ? { published: publish } : {};
    const rows: Record<string, unknown>[] = [];
    if (kind !== "photo")
      rows.push({
        kind: kind as ContentKind,
        // Arabic titles have no Latin letters for a link: the post gets a short code instead.
        slug: kind === "achievement" ? null : `${kind === "post" ? "news" : "project"}-${uid().slice(0, 8)}`,
        title: "",
        title_ar: name,
        summary_ar: body.trim() ? firstLine(body) : null,
        body_ar: body.trim() || null,
        result_ar: result.trim() || null,
        image_path: paths[0] ?? null,
        starts_at: kind === "achievement" ? now : null,
        tags: [],
        ...pub,
      });
    // The other photos (or all of them, for photos only) go to the gallery under the post's name.
    for (const [i, path] of paths.entries())
      if (kind === "photo" || i > 0) rows.push({ kind: "photo", title: "", image_path: path, tags: [album], starts_at: files[i].file.lastModified ? new Date(files[i].file.lastModified).toISOString() : now, ...pub });
    try {
      await sb().from("site_content").insert(rows).then(must);
      toast(admin && publish ? "اتنشر على الموقع ✅ (بيظهر خلال دقايق)" : "اتحفظ كمسودة، والمشرف هيراجعه وينشره", "ok");
      onDone();
      onClose();
    } catch (e) {
      removeObjects(paths.filter(Boolean), "site").catch(() => undefined);
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={() => !busy && onClose()} title="انشر على الموقع" wide>
      <div className="grid gap-4" data-testid="quick-post">
        <div className="flex flex-wrap gap-2">
          {KINDS.map((x) => (
            <Chip key={x.k} active={kind === x.k} onClick={() => setKind(x.k)}>
              {x.label}
            </Chip>
          ))}
        </div>

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--line-2)] bg-deep p-5 text-center">
          <Icon name="image" size={28} className="text-cyan" />
          <span className="font-semibold text-chalk">{files.length ? `${files.length} صورة · ضيف كمان` : "اختار صور من الموبايل"}</span>
          <span className="text-xs text-fog">{kind === "photo" ? `لحد ${MAX} صورة، بتتصغّر قبل الرفع` : "أول صورة هي الغلاف، والباقي بيروح الجاليري في ألبوم باسم البوست"}</span>
          <input type="file" accept="image/*" multiple className="sr-only" disabled={busy} data-testid="quick-photos" onChange={(e) => (add(e.target.files), (e.target.value = ""))} />
        </label>
        {files.length > 0 && (
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {files.map((f, i) => (
              <li key={f.id} className="relative aspect-square overflow-hidden rounded-xl border border-[var(--line-2)]">
                <img src={f.url} alt="" className="size-full object-cover" />
                {i === 0 && kind !== "photo" ? (
                  <span className="absolute inset-x-0 bottom-0 bg-volt/90 py-0.5 text-center text-[0.65rem] font-bold text-white">الغلاف</span>
                ) : (
                  kind !== "photo" && (
                    <button type="button" onClick={() => cover(f.id)} className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-[0.65rem] text-white">
                      خليها الغلاف
                    </button>
                  )
                )}
                <button type="button" aria-label="شيل الصورة" disabled={busy} onClick={() => drop(f.id)} className="absolute end-1 top-1 rounded-full bg-black/70 p-1 text-white">
                  <Icon name="close" size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <Field label={k.title}>
          <Input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "photo" ? "مثلاً: ورشة Arduino" : undefined} />
        </Field>
        {kind === "achievement" && (
          <Field label="المركز / النتيجة">
            <Input value={result} maxLength={120} onChange={(e) => setResult(e.target.value)} placeholder="مثلاً: المركز الأول" />
          </Field>
        )}
        {kind !== "photo" && (
          <Field label={k.body} hint={body.trim() ? `على كارت الموقع: «${firstLine(body)}»` : "أول جملة بتظهر على كارت الموقع، والباقي في صفحة البوست."}>
            <Textarea rows={5} maxLength={6000} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
        )}

        {admin ? (
          <Toggle checked={publish} onChange={setPublish} label="انشره على الموقع دلوقتي" hint="لو قفلته هيتحفظ مسودة في «محتوى الموقع»." />
        ) : (
          <p className="text-sm text-fog">هيتحفظ كمسودة، واللي عنده صلاحية النشر هيراجعه وينشره.</p>
        )}
        <Button variant="primary" size="lg" block loading={busy} onClick={send} data-testid="quick-send">
          {busy && files.length ? `بنرفع الصور… ${Math.round(progress * 100)}%` : admin && publish ? "انشر" : "احفظ"}
        </Button>
      </div>
    </Sheet>
  );
}
