"use client";
/**
 * The college's post for one event (media desk): what it was, the tracks, who represented the
 * college (from who was scanned in), the supervisor and a result if there was one — written in the
 * faculty's style under its saved patronage lines (src/lib/college-post.ts). The best photos of the
 * event are suggested by image maths (src/lib/photo-pick.ts), and the post goes out with them in one
 * tap (share sheet, or saved + copied).
 */
import { useMemo, useState } from "react";
import { collegePost, guessKind, MAX_NAMES, STYLES, TRACKS, type CollegeSetup, type Track } from "@/lib/college-post";
import type { DeskEvent } from "@/lib/media-writer";
import { look } from "@/lib/photo-frame";
import { skinShare, suggest, type Seen } from "@/lib/photo-pick";
import { asJpeg, fileFromUrl } from "@/lib/share-files";
import { siteImageUrl } from "@/lib/site-content";
import { can, errorText, must, rpc, sb, sharePhotos, type StaffRow } from "./core";
import { Button, Chip, Field, Input, Select, Textarea, Toggle, copyText, toast } from "./ui";

const SHOWN = 12;

type Pic = { path: string; seen: Seen | null };

/** A small copy of a photo's pixels: how sharp, how bright, its hash, and how much of it is people. */
async function seeThumb(url: string): Promise<Seen | null> {
  try {
    const blob = await (await fetch(url)).blob();
    const bmp = await createImageBitmap(blob);
    const w = 96,
      h = Math.max(8, Math.round((96 * bmp.height) / bmp.width));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true })!;
    x.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const px = x.getImageData(0, 0, w, h).data;
    return { ...look(px, w, h), skin: skinShare(px) };
  } catch {
    return null;
  }
}

export function CollegePostPanel({ e, setup, me, onSetup }: { e: DeskEvent & { keys?: string[] }; setup: CollegeSetup; me: StaffRow; onSetup: (s: CollegeSetup) => void }) {
  const guess = useMemo(() => guessKind(e.title), [e.title]);
  const [kind, setKind] = useState(guess.kind);
  const [ours, setOurs] = useState(guess.ours);
  const [blurb, setBlurb] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [extra, setExtra] = useState({ name: "", desc: "" });
  const [names, setNames] = useState("");
  // The saved supervisor until someone types another (the setup can arrive after this opens).
  const [typedSupervisor, setSupervisor] = useState<string | null>(null);
  const supervisor = typedSupervisor ?? setup.supervisor ?? "";
  const [result, setResult] = useState("");
  const [edited, setEdited] = useState<string | null>(null);
  const [loadingNames, setLoadingNames] = useState(false);
  const [pics, setPics] = useState<Pic[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [looking, setLooking] = useState(false);
  const [files, setFiles] = useState<File[] | null>(null);
  const [getting, setGetting] = useState(false);
  const [editSetup, setEditSetup] = useState(false);

  const text = useMemo(
    () =>
      collegePost(setup, {
        event: e,
        blurb,
        tracks,
        names: names.split(/\n|،|,/).map((n) => n.trim()).filter(Boolean),
        supervisor,
        result,
        kind,
        ours,
      }),
    [setup, e, blurb, tracks, names, supervisor, result, kind, ours],
  );
  const post = edited ?? text;
  // Any change to the fields rewrites the post (a hand edit lasts until then).
  const change = <T,>(set: (v: T) => void) => (v: T) => (set(v), setEdited(null), setFiles(null));

  const loadNames = async () => {
    setLoadingNames(true);
    try {
      const list = (await rpc<string[]>("staff_event_people", { p_key: e.key })) ?? [];
      if (!list.length) toast("مفيش حد متسجّل حضوره بالـ QR في الفعالية دي", "info");
      else change(setNames)(list.join("\n"));
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setLoadingNames(false);
    }
  };

  const findPics = async () => {
    setLooking(true);
    try {
      const rows = ((await sb()
        .from("site_content")
        .select("image_path")
        .eq("kind", "photo")
        .eq("published", true)
        .contains("tags", [e.title])
        .not("image_path", "is", null)
        .order("sort_order")
        .order("created_at")
        .limit(80)
        .then(must)) ?? []) as { image_path: string }[];
      if (!rows.length) {
        setPics([]);
        return;
      }
      const seen: (Seen | null)[] = [];
      for (let i = 0; i < rows.length; i += 6) seen.push(...(await Promise.all(rows.slice(i, i + 6).map((r) => seeThumb(siteImageUrl(r.image_path, "thumb"))))));
      const best = suggest(seen, 4);
      const rest = rows.map((_, i) => i).filter((i) => !best.includes(i));
      const order = [...best, ...rest].slice(0, SHOWN);
      setPics(order.map((i) => ({ path: rows[i].image_path, seen: seen[i] })));
      setChosen(new Set(best.map((i) => rows[i].image_path)));
      setFiles(null);
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setLooking(false);
    }
  };

  const getFiles = async () => {
    setGetting(true);
    try {
      const name = e.title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40) || "buildx";
      const list = (pics ?? []).filter((p) => chosen.has(p.path));
      const got = (await Promise.allSettled(list.map((p, i) => fileFromUrl(siteImageUrl(p.path), `${name}-${i + 1}`).then(asJpeg)))).flatMap((x) => (x.status === "fulfilled" ? [x.value] : []));
      if (!got.length) return toast("الصور ما اتحملتش — جرّب تاني", "error");
      setFiles(got);
    } finally {
      setGetting(false);
    }
  };

  const send = async () => {
    const r = files?.length ? await sharePhotos(files, post) : null;
    if (!r) return copyText(post, "البوست اتنسخ — الصقه في صفحة الكلية");
    if (r !== "cancelled") toast(r === "shared" ? "اتبعت ✓ (والكلام اتنسخ لو التطبيق ما خدهوش)" : "الصور اتحفظت والبوست اتنسخ", "ok");
    // The supervisor typed is suggested next time.
    if (supervisor.trim() && supervisor.trim() !== (setup.supervisor ?? "") && can(me, "site")) {
      const next = { ...setup, supervisor: supervisor.trim() };
      rpc("staff_college_setup_save", { p: next }).then(() => onSetup(next), () => undefined);
    }
  };

  const toggleTrack = (t: Track) => change(setTracks)(tracks.some((x) => x.name === t.name) ? tracks.filter((x) => x.name !== t.name) : [...tracks, t]);

  return (
    <div className="grid gap-3" data-testid="desk-college">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-chalk">بوست الكلية</p>
        {can(me, "site") && (
          <Button size="sm" variant="ghost" onClick={() => setEditSetup(!editSetup)} data-testid="college-setup-open">
            {editSetup ? "خلاص" : "بيانات الكلية والرعاية"}
          </Button>
        )}
      </div>
      {editSetup && <SetupEditor setup={setup} onSaved={(s) => (onSetup(s), setEditSetup(false), setEdited(null))} />}
      {!setup.header?.trim() && !editSetup && <p className="text-xs text-warn">سطور «تحت رعاية… وتحت إشراف…» لسه متكتبتش — اكتبها مرة واحدة من «بيانات الكلية والرعاية».</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="كانت إيه">
          <Select value={kind} onChange={(x) => change(setKind)(x.target.value)} data-testid="college-kind">
            {Object.entries(STYLES).map(([k, s]) => (
              <option key={k} value={k}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Toggle checked={ours} onChange={change(setOurs)} label="إحنا اللي نظمناها" hint="لو مقفول: الطلاب شاركوا فيها." />
      </div>
      <Field label="وصف قصير (اختياري)" hint="مثلاً: إحدى المسابقات المتخصصة في مجال الروبوتات والأنظمة الذكية">
        <Input value={blurb} maxLength={200} onChange={(x) => change(setBlurb)(x.target.value)} data-testid="college-blurb" />
      </Field>
      <div className="grid gap-2">
        <p className="text-sm text-mist">المجالات</p>
        <div className="flex flex-wrap gap-2">
          {[...TRACKS, ...tracks.filter((t) => !TRACKS.some((x) => x.name === t.name))].map((t) => (
            <Chip key={t.name} active={tracks.some((x) => x.name === t.name)} onClick={() => toggleTrack(t)}>
              {`${t.emoji} ${t.name}`}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Input className="max-w-[12rem]" placeholder="مجال تاني" value={extra.name} maxLength={60} onChange={(x) => setExtra({ ...extra, name: x.target.value })} />
          <Input className="min-w-0 flex-1" placeholder="سطر يشرحه" value={extra.desc} maxLength={240} onChange={(x) => setExtra({ ...extra, desc: x.target.value })} />
          <Button
            size="sm"
            disabled={!extra.name.trim()}
            onClick={() => {
              toggleTrack({ name: extra.name.trim(), emoji: "🔹", desc: extra.desc.trim() });
              setExtra({ name: "", desc: "" });
            }}
          >
            ضيف
          </Button>
        </div>
      </div>
      {!ours && (
        <Field label={`مثّل الكلية (اسم في كل سطر — لحد ${MAX_NAMES} بيتكتبوا بالاسم، أكتر من كده بيتكتب العدد)`}>
          <Textarea rows={4} value={names} onChange={(x) => change(setNames)(x.target.value)} data-testid="college-names" />
        </Field>
      )}
      {!ours && e.key.startsWith("form:") && (
        <Button size="sm" variant="ghost" loading={loadingNames} onClick={() => void loadNames()} data-testid="college-names-load">
          هات أسماء اللي حضروا (من الـ QR)
        </Button>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="تحت إشراف">
          <Input value={supervisor} maxLength={200} placeholder="م. …، المعيدة بقسم …" onChange={(x) => change(setSupervisor)(x.target.value)} data-testid="college-supervisor" />
        </Field>
        <Field label="النتيجة (لو فيه)" hint="بتتكتب بس لو كتبتها — مفيش حاجة بتتألف.">
          <Input value={result} maxLength={200} placeholder="وحصل الفريق على المركز …" onChange={(x) => change(setResult)(x.target.value)} data-testid="college-result" />
        </Field>
      </div>
      <Field label="البوست" hint="عدّل فيه براحتك — أي تغيير في الخانات اللي فوق بيكتبه من جديد.">
        <Textarea rows={14} value={post} onChange={(x) => setEdited(x.target.value)} data-testid="college-text" />
      </Field>

      <div className="grid gap-2" data-testid="college-photos">
        {pics === null ? (
          <Button size="sm" icon="image" loading={looking} disabled={!e.photos} onClick={() => void findPics()} data-testid="college-suggest">
            {e.photos ? "رشّح صور للبوست" : "مفيش صور للفعالية على الموقع لسه"}
          </Button>
        ) : !pics.length ? (
          <p className="text-sm text-fog">مفيش صور منشورة للفعالية دي.</p>
        ) : (
          <>
            <p className="text-sm text-mist">{`الأحسن متعلّم عليها (الأوضح وفيها ناس، من غير المكرر) — ${chosen.size} مختارة`}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {pics.map((p) => (
                <button
                  key={p.path}
                  type="button"
                  aria-pressed={chosen.has(p.path)}
                  onClick={() => {
                    const next = new Set(chosen);
                    if (next.has(p.path)) next.delete(p.path);
                    else next.add(p.path);
                    setChosen(next);
                    setFiles(null);
                  }}
                  className={`relative overflow-hidden rounded-lg border-2 ${chosen.has(p.path) ? "border-cyan" : "border-transparent opacity-60"}`}
                  data-testid="college-pic"
                >
                  <img src={siteImageUrl(p.path, "thumb")} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                  {chosen.has(p.path) && <span className="absolute end-1 top-1 rounded-full bg-cyan px-1.5 text-xs font-bold text-void">✓</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {pics?.length && chosen.size && !files ? (
          <Button variant="primary" icon="image" loading={getting} onClick={() => void getFiles()} data-testid="college-ready">
            {`جهّز ${chosen.size} صورة مع البوست`}
          </Button>
        ) : (
          <Button variant="primary" icon="share" onClick={() => void send()} data-testid="college-share">
            {files?.length ? `شارك البوست + ${files.length} صورة` : "انسخ البوست"}
          </Button>
        )}
        <Button size="sm" icon="copy" onClick={() => copyText(post, "البوست اتنسخ — الصقه في صفحة الكلية")}>
          انسخ الكلام بس
        </Button>
      </div>
    </div>
  );
}

function SetupEditor({ setup, onSaved }: { setup: CollegeSetup; onSaved: (s: CollegeSetup) => void }) {
  const [s, setS] = useState<CollegeSetup>(setup);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await rpc("staff_college_setup_save", { p: s });
      toast("اتحفظت — هتظهر في كل بوست", "ok");
      onSaved(s);
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-3 rounded-xl border border-[var(--line)] p-3" data-testid="college-setup">
      <Field label="سطور الرعاية والإشراف" hint="زي ما الكلية بتكتبها: تحت رعاية… وبريادة… وتحت إشراف…">
        <Textarea rows={8} value={s.header} maxLength={2000} onChange={(x) => setS({ ...s, header: x.target.value })} data-testid="college-header" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="الطلاب">
          <Input value={s.students} maxLength={200} placeholder="طلاب برنامجي …" onChange={(x) => setS({ ...s, students: x.target.value })} />
        </Field>
        <Field label="الكلية">
          <Input value={s.college} maxLength={200} placeholder="كلية …" onChange={(x) => setS({ ...s, college: x.target.value })} />
        </Field>
        <Field label="الجامعة">
          <Input value={s.university} maxLength={120} onChange={(x) => setS({ ...s, university: x.target.value })} />
        </Field>
        <Field label="المجال (في سطر الختام)">
          <Input value={s.field} maxLength={200} onChange={(x) => setS({ ...s, field: x.target.value })} />
        </Field>
      </div>
      <Button variant="primary" loading={busy} onClick={() => void save()} data-testid="college-setup-save">
        احفظ
      </Button>
    </div>
  );
}
