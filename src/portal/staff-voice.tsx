"use client";

/**
 * "صوت بقلظ": a team member records Baqloz's lines in their own voice (or uploads an audio file of
 * a line) and the site plays it instead of the generated voice. Pick a line, record, listen, save,
 * and the next line opens. The take is cleaned on the phone (src/portal/audio.ts) and saved in the
 * "voice" bucket; public.voice_clips says which file each line plays. Turning a recording off brings
 * the generated voice back.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { voiceLines, type VoiceLine } from "@/lib/mascot/voice-lines";
import { SUPABASE_URL } from "@/lib/supabase-public";
import { MAX_SECONDS, canRecord, decodeAudio, prepareVoice, startRecording, type VoiceEffect } from "./audio";
import { errorText, fmt, must, publicOrigin, sb } from "./core";
import { Badge, Bar, Button, Card, Chip, Empty, ErrorBox, Icon, List, Loading, Row, SearchBox, Section, Select, Sheet, TopBar, confirmDialog, toast, useAsync } from "./ui";

type Clip = { key: string; line: string; path: string; seconds: number | null; active: boolean; updated_at: string };
type Filter = "todo" | "done" | "all";

const fileUrl = (path: string) => `${SUPABASE_URL}/storage/v1/object/public/voice/${path.split("/").map(encodeURIComponent).join("/")}`;
const madeUrl = (key: string) => `${publicOrigin()}/voice/${key}.mp3`;

const EFFECTS: { k: VoiceEffect; label: string }[] = [
  { k: 0, label: "صوتك زي ما هو" },
  { k: 1, label: "صوت بقلظ (أرفع سنة)" },
  { k: 2, label: "كرتوني" },
];

export function VoiceStudio() {
  const lines = useMemo(() => voiceLines(), []);
  const { data, error, loading, reload } = useAsync(async () => {
    const [rows, made] = await Promise.all([
      sb().from("voice_clips").select("key, line, path, seconds, active, updated_at").then(must) as Promise<Clip[]>,
      // The generated voice's clips (on the website; not reachable from inside the native app).
      fetch(`${publicOrigin()}/voice/manifest.json`)
        .then((r) => (r.ok ? (r.json() as Promise<{ clips?: string[] }>) : null))
        .then((m) => (m ? new Set(m.clips ?? []) : null))
        .catch(() => null),
    ]);
    return { clips: new Map(rows.map((r) => [r.key, r])), made };
  }, []);
  const [filter, setFilter] = useState<Filter>("todo");
  const [group, setGroup] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const mine = (k: string) => !!data?.clips.get(k)?.active;
  const groups = useMemo(() => [...new Set(lines.map((l) => l.group))], [lines]);
  const shown = lines.filter(
    (l) =>
      (!group || l.group === group) &&
      (filter === "all" || (filter === "done" ? mine(l.key) : !mine(l.key))) &&
      (!q.trim() || l.said.includes(q.trim())),
  );
  const done = lines.filter((l) => mine(l.key)).length;
  const current = open ? lines.find((l) => l.key === open) ?? null : null;
  /** After saving, the next line in this list (the one just saved may leave a "not yet" list). */
  const next = (key: string) => {
    const i = shown.findIndex((l) => l.key === key);
    const rest = [...shown.slice(i + 1), ...shown.slice(0, Math.max(0, i))].filter((l) => l.key !== key && !mine(l.key));
    return rest[0]?.key ?? null;
  };

  return (
    <>
      <TopBar title="صوت بقلظ" sub="سجّل كلامه بصوتك بدل الصوت الآلي" back="/staff/more" />
      <Card className="grid gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-volt/15 text-volt">
            <Icon name="mic" size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-chalk">
              {done} من {lines.length} جملة بصوتكم
            </p>
            <p className="text-xs text-fog">الباقي بيتقال بالصوت الآلي لحد ما تسجّلوه.</p>
          </div>
        </div>
        <Bar value={lines.length ? Math.round((done / lines.length) * 100) : 0} tone="ok" />
        <p className="text-xs leading-relaxed text-fog">
          اختار جملة ← اضغط «سجّل» وقولها بروح بقلظ (مصري وخفيف) ← اسمعها ← «احفظ». أو ارفع ملف صوت جاهز. الموقع بيشغّل صوتك بدل الآلي في خلال دقايق. سجّل في مكان هادي والموبايل على بعد شبر من بُقك.
        </p>
      </Card>
      <div className="mt-4 flex flex-wrap gap-2">
        <Chip active={filter === "todo"} onClick={() => setFilter("todo")} count={lines.length - done}>
          لسه
        </Chip>
        <Chip active={filter === "done"} onClick={() => setFilter("done")} count={done}>
          بصوتكم
        </Chip>
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>
          الكل
        </Chip>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_14rem]">
        <SearchBox value={q} onChange={setQ} placeholder="دوّر على جملة…" />
        <Select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="المكان">
          <option value="">كل الأماكن</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </Select>
      </div>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : !shown.length ? (
        <Empty icon="mic" title={filter === "todo" ? "كله متسجّل 🎉" : "مفيش جمل هنا"} body={filter === "todo" ? "كل الجمل اللي هنا بقت بصوتكم." : undefined} />
      ) : (
        <Section title={`${shown.length} جملة`} className="mt-4">
          <div data-testid="voice-lines">
          <List>
            {shown.map((l) => {
              const c = data?.clips.get(l.key);
              return (
                <Row key={l.key} onClick={() => setOpen(l.key)}>
                  <p className="text-[15px] leading-relaxed text-chalk">{l.text}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fog">
                    <span>{l.group}</span>
                    {c?.active ? (
                      <Badge tone="ok">بصوتكم ✓</Badge>
                    ) : data?.made ? (
                      data.made.has(l.key) ? <Badge>صوت آلي</Badge> : <Badge tone="warn">من غير صوت</Badge>
                    ) : null}
                  </p>
                </Row>
              );
            })}
          </List>
          </div>
        </Section>
      )}
      {current && (
        <RecordSheet
          key={current.key}
          line={current}
          clip={data?.clips.get(current.key) ?? null}
          made={data?.made?.has(current.key) ?? null}
          onClose={() => setOpen(null)}
          onSaved={(goNext) => {
            const n = goNext ? next(current.key) : null;
            reload();
            setOpen(n);
          }}
        />
      )}
    </>
  );
}

type Take = { buf: AudioBuffer; blob: Blob; url: string; seconds: number };

function RecordSheet({ line, clip, made, onClose, onSaved }: { line: VoiceLine; clip: Clip | null; made: boolean | null; onClose: () => void; onSaved: (next: boolean) => void }) {
  const [effect, setEffect] = useState<VoiceEffect>(1);
  const [take, setTake] = useState<Take | null>(null);
  const [rec, setRec] = useState<Awaited<ReturnType<typeof startRecording>> | null>(null);
  const [secs, setSecs] = useState(0);
  const [busy, setBusy] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  useEffect(() => () => rec?.cancel(), [rec]);
  useEffect(() => {
    if (!rec) return;
    const t0 = Date.now();
    const id = setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 250);
    return () => clearInterval(id);
  }, [rec]);

  const prepare = async (buf: AudioBuffer, fx: VoiceEffect) => {
    const out = await prepareVoice(buf, fx);
    const url = URL.createObjectURL(out.blob);
    urls.current.push(url);
    setTake({ buf, blob: out.blob, url, seconds: out.seconds });
  };
  const fail = (e: unknown) => {
    const m = e instanceof Error ? e.message : "";
    toast(
      m === "too_long"
        ? `الجملة أطول من ${MAX_SECONDS} ثانية`
        : m === "no_audio" || e instanceof DOMException
          ? e instanceof DOMException && e.name === "NotAllowedError"
            ? "اسمح للتطبيق يستخدم المايك من إعدادات المتصفح"
            : "مش قادر أفتح الصوت ده. جرّب ملف mp3 أو m4a أو wav"
          : errorText(e),
      "error",
    );
  };
  const begin = async () => {
    try {
      setSecs(0);
      setRec(await startRecording());
    } catch (e) {
      fail(e);
    }
  };
  const end = async () => {
    if (!rec) return;
    setBusy("rec");
    try {
      const blob = await rec.stop();
      setRec(null);
      await prepare(await decodeAudio(blob), effect);
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) return toast("الملف كبير أوي (أقصى حاجة 25 ميجا)", "error");
    setBusy("file");
    try {
      await prepare(await decodeAudio(f), effect);
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
      if (file.current) file.current.value = "";
    }
  };
  const changeEffect = async (fx: VoiceEffect) => {
    setEffect(fx);
    if (!take) return;
    setBusy("fx");
    try {
      await prepare(take.buf, fx);
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  };
  const save = async (goNext: boolean) => {
    if (!take) return;
    setBusy(goNext ? "next" : "save");
    try {
      const path = `${line.key}/${Date.now()}.wav`;
      const up = await sb().storage.from("voice").upload(path, take.blob, { contentType: "audio/wav", cacheControl: "31536000", upsert: false });
      if (up.error) throw up.error;
      await sb().from("voice_clips").upsert({ key: line.key, line: line.said, path, seconds: take.seconds, active: true }, { onConflict: "key" }).then(must);
      toast("اتحفظت ✓ الموقع هيشغّل صوتك");
      onSaved(goNext);
    } catch (e) {
      toast(errorText(e), "error");
      setBusy("");
    }
  };
  const revert = async () => {
    if (!clip) return;
    const ok = await confirmDialog({ title: "ترجع للصوت الآلي؟", body: "الجملة دي هتتقال بالصوت الآلي تاني. تقدر تسجّلها بصوتك تاني في أي وقت.", ok: "رجّع الآلي" });
    if (!ok) return;
    setBusy("revert");
    try {
      await sb().from("voice_clips").update({ active: false }).eq("key", line.key).then(must);
      toast("رجع الصوت الآلي");
      onSaved(false);
    } catch (e) {
      toast(errorText(e), "error");
      setBusy("");
    }
  };

  return (
    <Sheet open onClose={onClose} title="سجّل الجملة دي">
      <div className="grid gap-4" data-testid="voice-recorder">
        <div className="rounded-2xl border border-[var(--line-2)] bg-white/[0.03] p-4">
          <p className="text-xs text-fog">{line.group}</p>
          <p className="mt-2 text-xl font-semibold leading-relaxed text-chalk">{line.text}</p>
          {/[A-Za-z]/.test(line.text) && <p className="mt-2 text-xs text-fog">بتتقال: {line.said}</p>}
        </div>

        {clip?.active ? (
          <div className="grid gap-1.5">
            <p className="text-xs text-fog">
              بصوتكم دلوقتي · {fmt.dateTime(clip.updated_at)}
              {clip.seconds ? ` · ${clip.seconds} ث` : ""}
            </p>
            <audio controls preload="none" src={fileUrl(clip.path)} className="w-full" />
          </div>
        ) : made ? (
          <div className="grid gap-1.5">
            <p className="text-xs text-fog">الصوت الآلي دلوقتي</p>
            <audio controls preload="none" src={madeUrl(line.key)} className="w-full" />
          </div>
        ) : null}

        <div className="grid gap-2">
          <p className="text-xs font-semibold text-mist">شكل الصوت</p>
          <div className="flex flex-wrap gap-2">
            {EFFECTS.map((x) => (
              <Chip key={x.k} active={effect === x.k} onClick={() => void changeEffect(x.k)}>
                {x.label}
              </Chip>
            ))}
          </div>
        </div>

        {rec ? (
          <Button variant="danger" size="lg" block icon="stop" onClick={() => void end()} loading={busy === "rec"}>
            <span className="inline-flex items-center gap-2">
              <span className="size-2.5 animate-pulse rounded-full bg-white" />
              وقّف ({secs} ث من {MAX_SECONDS})
            </span>
          </Button>
        ) : canRecord() ? (
          <Button variant={take ? "secondary" : "primary"} size="lg" block icon="mic" onClick={() => void begin()} disabled={!!busy}>
            {take ? "سجّل تاني" : "سجّل"}
          </Button>
        ) : (
          <p className="rounded-xl bg-warn/10 p-3 text-xs leading-relaxed text-warn">
            التسجيل من المايك مش متاح هنا. افتح buildxhue.com/app من متصفح الموبايل (كروم أو سفاري)، أو ارفع ملف صوت متسجّل.
          </p>
        )}

        <input ref={file} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac,.opus,.webm" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} data-testid="voice-file" />
        <Button variant="ghost" icon="upload" onClick={() => file.current?.click()} loading={busy === "file"} disabled={!!rec}>
          ارفع ملف صوت
        </Button>

        {take && (
          <div className="grid gap-2 rounded-2xl border border-volt/30 bg-volt/[0.06] p-3" data-testid="voice-take">
            <p className="text-xs text-mist">اسمع التسجيل ({take.seconds} ث) قبل ما تحفظه</p>
            <audio controls src={take.url} className="w-full" />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="primary" icon="check" onClick={() => void save(true)} loading={busy === "next"} disabled={!!busy && busy !== "next"}>
                احفظ واللي بعدها
              </Button>
              <Button onClick={() => void save(false)} loading={busy === "save"} disabled={!!busy && busy !== "save"}>
                احفظ بس
              </Button>
            </div>
          </div>
        )}

        {clip?.active && (
          <Button variant="ghost" icon="refresh" onClick={() => void revert()} loading={busy === "revert"} disabled={!!rec}>
            رجّع الصوت الآلي للجملة دي
          </Button>
        )}
      </div>
    </Sheet>
  );
}
