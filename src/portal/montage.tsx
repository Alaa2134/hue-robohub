"use client";
/**
 * /staff/montage — the smart montage: pick dozens of event videos (and a song, if wanted), and the
 * app watches them, picks the best moments, cuts them on the beat and records a finished reel in the
 * BuildX style — for Reels/Stories, a post, or YouTube. Everything happens on this device: nothing is
 * uploaded and nothing is paid for. See src/lib/montage.ts and src/portal/montage-engine.ts.
 */
import { useEffect, useRef, useState } from "react";
import { FORMATS, planMontage, type FormatKey, type Segment } from "@/lib/montage";
import { fmt, sharePhotos, today, type StaffRow } from "./core";
import { analyse, musicBeat, recordType, renderMontage, type Analysed } from "./montage-engine";
import { Button, Card, Chip, Field, Icon, Input, Toggle, TopBar, toast } from "./ui";

const MAX = 60;
const LENGTHS = [15, 30, 60] as const;

export function MontageScreen({ query }: { me: StaffRow; query?: URLSearchParams }) {
  const [files, setFiles] = useState<File[]>([]);
  const [seen, setSeen] = useState<(Analysed | null)[]>([]);
  const [reading, setReading] = useState(0);
  const [music, setMusic] = useState<File | null>(null);
  const [beat, setBeat] = useState<number | null>(null);
  const [format, setFormat] = useState<FormatKey>("reel");
  const [length, setLength] = useState<(typeof LENGTHS)[number]>(30);
  const [sound, setSound] = useState(true);
  const [title, setTitle] = useState(query?.get("title") ?? "");
  const [sub, setSub] = useState(query?.get("sub") ?? "");
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState<number | null>(null);
  const [out, setOut] = useState<{ blob: Blob; url: string } | null>(null);
  const stop = useRef({ now: false });
  useEffect(() => () => void (out && URL.revokeObjectURL(out.url)), [out]);

  // Watch each video once, one after another, as soon as they're picked.
  useEffect(() => {
    let live = true;
    (async () => {
      const got: (Analysed | null)[] = [];
      for (let i = 0; i < files.length && live; i++) {
        setReading(files.length - i);
        got.push(await analyse(files[i]));
        if (live) setSeen([...got]);
      }
      if (live) setReading(0);
    })();
    return () => {
      live = false;
    };
  }, [files]);

  useEffect(() => {
    let live = true;
    if (music) musicBeat(music).then((b) => live && setBeat(b));
    else setBeat(null);
    return () => {
      live = false;
    };
  }, [music]);

  const usable = seen.map((a, i) => ({ a, i })).filter((x): x is { a: Analysed; i: number } => !!x.a && !skip.has(x.i));
  const plan: Segment[] = reading ? [] : planMontage(usable.map((x) => x.a.clip), length, beat).map((s) => ({ ...s, clip: usable[s.clip].i }));
  const bad = seen.filter((a) => a === null).length;

  const make = async () => {
    if (!plan.length) return;
    stop.current = { now: false };
    setProgress(0);
    setOut(null);
    try {
      const f = FORMATS[format];
      const blob = await renderMontage(files, plan, { w: f.w, h: f.h, title: title.trim(), sub: sub.trim(), music, sound, seed: `${title}:${files.length}`, onProgress: setProgress, stop: stop.current });
      if (stop.current.now) return toast("اتوقف", "info");
      setOut({ blob, url: URL.createObjectURL(blob) });
      toast(`الفيديو جاهز · ${fmt.size(blob.size)}`, "ok");
    } catch (e) {
      toast(String((e as Error)?.message) === "no_recorder" ? "المتصفح ده مبيعرفش يسجّل فيديو — جرّب كروم أو سفاري جديد" : "حصلت مشكلة وهو بيعمل الفيديو — جرّب تاني", "error");
    } finally {
      setProgress(null);
    }
  };

  const ext = out?.blob.type.includes("mp4") ? "mp4" : "webm";
  const name = `buildx-reel-${today()}.${ext}`;
  const share = async () => {
    if (!out) return;
    const r = await sharePhotos([new File([out.blob], name, { type: out.blob.type })], title.trim());
    if (r !== "cancelled") toast(r === "shared" ? "اتبعت ✓" : "اتحفظ على الجهاز", "ok");
  };

  return (
    <>
      <TopBar title="مونتاج ذكي" sub="ارمي فيديوهات الفعالية — هو يختار أحلى اللقطات ويعمل فيديو جاهز للسوشيال" back="/staff/site" />
      <div className="grid gap-4" data-testid="montage">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--line-2)] bg-deep p-5 text-center">
          <Icon name="film" size={28} className="text-cyan" />
          <span className="font-semibold text-chalk">{files.length ? `${files.length} فيديو (${fmt.size(files.reduce((n, f) => n + f.size, 0))}) · غيّرهم` : "اختار الفيديوهات (لحد 60)"}</span>
          <span className="text-xs text-fog">بيتشافوا على جهازك ومفيش حاجة بتترفع. الأحسن من كمبيوتر لو الفيديوهات كتير.</span>
          <input
            type="file"
            accept="video/*"
            multiple
            className="sr-only"
            disabled={progress !== null}
            data-testid="montage-videos"
            onChange={(e) => {
              setFiles(Array.from(e.target.files ?? []).slice(0, MAX));
              setSeen([]);
              setSkip(new Set());
              setOut(null);
              e.target.value = "";
            }}
          />
        </label>
        {reading > 0 && (
          <p className="text-sm text-mist" data-testid="montage-reading">
            {`بيتفرّج على الفيديوهات ويختار اللقطات… فاضل ${reading}`}
          </p>
        )}

        <Card className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(FORMATS) as FormatKey[]).map((k) => (
              <Chip key={k} active={format === k} onClick={() => setFormat(k)}>
                {FORMATS[k].label}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {LENGTHS.map((l) => (
              <Chip key={l} active={length === l} onClick={() => setLength(l)}>
                {`${l} ثانية`}
              </Chip>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="الاسم اللي بيظهر في الفيديو">
              <Input value={title} maxLength={60} placeholder="مثلاً: MENA Robotics Summit 2026" onChange={(e) => setTitle(e.target.value)} data-testid="montage-title" />
            </Field>
            <Field label="سطر صغير تحته (اختياري)">
              <Input value={sub} maxLength={60} placeholder="E-JUST · 30 October 2026" onChange={(e) => setSub(e.target.value)} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="btn btn-sm cursor-pointer">
              <Icon name="volume" size={16} />
              {music ? `🎵 ${music.name.slice(0, 30)}` : "أغنية / موسيقى (اختياري)"}
              <input type="file" accept="audio/*" className="sr-only" onChange={(e) => (setMusic(e.target.files?.[0] ?? null), (e.target.value = ""))} />
            </label>
            {music && (
              <>
                <span className="text-xs text-fog">{beat ? `الإيقاع ${Math.round(60 / beat)} BPM — القطع هيبقى على الدقة` : "بيسمع الإيقاع…"}</span>
                <Button size="sm" variant="ghost" onClick={() => setMusic(null)}>
                  شيلها
                </Button>
              </>
            )}
          </div>
          <Toggle checked={sound} onChange={setSound} label="صوت الفيديوهات نفسها" hint={music ? "هيبقى أوطى من الموسيقى." : "لو مقفول والموسيقى مش موجودة، الفيديو هيطلع من غير صوت."} />
        </Card>

        {seen.length > 0 && !reading && (
          <Card className="grid gap-2" data-testid="montage-plan">
            <p className="text-sm text-mist">
              {plan.length
                ? `${plan.length} لقطة · حوالي ${Math.round(plan.reduce((a, s) => a + s.len, 0) + 4)} ثانية — أول لقطة هي أقواهم، والباقي بترتيب التصوير. اضغط على فيديو عشان تشيله.`
                : "مفيش لقطات تنفع — جرّب فيديوهات أوضح"}
              {bad ? ` · ${bad} فيديو ما اتقراش` : ""}
            </p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {seen.map((a, i) =>
                a ? (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSkip(new Set(skip.has(i) ? [...skip].filter((x) => x !== i) : [...skip, i]))}
                    className={`relative overflow-hidden rounded-lg border-2 ${plan.some((s) => s.clip === i) ? "border-cyan" : skip.has(i) ? "border-danger opacity-40" : "border-transparent opacity-60"}`}
                    aria-pressed={!skip.has(i)}
                    data-testid="montage-clip"
                  >
                    <img src={a.thumb} alt={files[i]?.name ?? ""} className="aspect-square w-full object-cover" />
                    {plan[0]?.clip === i && <span className="absolute start-1 top-1 rounded bg-cyan px-1 text-[10px] font-bold text-void">البداية</span>}
                  </button>
                ) : null,
              )}
            </div>
          </Card>
        )}

        {progress !== null ? (
          <Card className="grid gap-2" data-testid="montage-progress">
            <p className="text-sm text-mist">{`بيعمل الفيديو… ${Math.round(progress * 100)}% — سيب الشاشة مفتوحة لحد ما يخلص`}</p>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-cyan transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <Button size="sm" onClick={() => (stop.current.now = true)}>
              وقّف
            </Button>
          </Card>
        ) : (
          <Button variant="primary" icon="film" disabled={!plan.length || !!reading} onClick={() => void make()} data-testid="montage-make">
            اعمل الفيديو
          </Button>
        )}
        {!recordType() && <p className="text-xs text-warn">المتصفح ده مش هيعرف يسجّل الفيديو — افتح التطبيق من كروم أو سفاري جديد.</p>}

        {out && (
          <Card className="grid gap-3" data-testid="montage-out">
            <video src={out.url} controls playsInline className="max-h-[70vh] w-full rounded-xl bg-black" data-testid="montage-video" />
            <p className="text-xs text-fog">{`${ext.toUpperCase()} · ${fmt.size(out.blob.size)}${ext === "webm" ? " — المتصفح ده بيسجّل WebM؛ لو إنستجرام رفضه افتح من سفاري أو كروم جديد عشان يطلع MP4." : ""}`}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon="share" onClick={() => void share()} data-testid="montage-share">
                احفظ / شارك
              </Button>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
