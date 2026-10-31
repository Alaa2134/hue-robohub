"use client";
/**
 * /staff/media — the media desk. Every event of the last two months and the coming six weeks, with
 * its real numbers; for each one the news post and the social captions are already written (fixed
 * rules from the numbers, no AI — see src/lib/media-writer.ts). Before an event: the invitation for
 * Facebook, Instagram, LinkedIn and the WhatsApp channel. After it: the recap and a news post for the
 * website, saved as a draft (or published) in one tap, with the event's first photo as its cover.
 */
import { useMemo, useState } from "react";
import { captions, hashtags, isPast, mergeSameDay, newsAfter, arDay, SITE, type Captions, type DeskEvent } from "@/lib/media-writer";
import { asJpeg, fileFromUrl } from "@/lib/share-files";
import { siteImageUrl } from "@/lib/site-content";
import type { CollegeSetup } from "@/lib/college-post";
import { CollegePostPanel } from "./college-post";
import { EventCarousel, SoonCarousel } from "./event-carousel";
import { MonthReport } from "./month-report";
import { can, errorText, must, rpc, sb, sharePhotos, shareWords, uid, type StaffRow } from "./core";
import { firstLine } from "./quick-post";
import { Badge, Button, Card, Chip, Empty, ErrorBox, Field, Input, Loading, Textarea, Toggle, TopBar, copyText, go, toast, useAsync } from "./ui";

type Row = DeskEvent & { cover: string | null; post: { id: string; published: boolean; slug: string | null } | null; keys: string[] };
/** Photos per post: what Instagram takes in one carousel. */
const PICS = 10;
const NETS: [keyof Captions, string][] = [
  ["facebook", "فيسبوك"],
  ["instagram", "إنستجرام"],
  ["linkedin", "لينكدإن"],
  ["whatsapp", "قناة الواتساب"],
];

export function MediaDesk({ me }: { me: StaffRow }) {
  const { data, error, loading, reload } = useAsync(
    async () =>
      mergeSameDay(((await rpc<(Omit<Row, "keys" | "form"> & { bus?: boolean })[]>("staff_media_desk")) ?? []).map((e) => ({ ...e, form: e.key.startsWith("form:") }))) as Row[],
    [],
  );
  const college = useAsync(async () => ((await rpc<CollegeSetup>("staff_college_setup")) ?? {}) as CollegeSetup, []);
  const [setup, setSetup] = useState<CollegeSetup | null>(null);
  const collegeSetup: CollegeSetup = setup ?? { header: "", students: "", college: "", university: "", field: "", ...college.data };
  const now = Date.now();
  const coming = (data ?? []).filter((e) => !isPast(e, now)).sort((a, b) => a.at.localeCompare(b.at));
  const past = (data ?? []).filter((e) => isPast(e, now));
  const waiting = past.filter((e) => !e.post);

  return (
    <>
      <TopBar title="مكتب الميديا" sub="الخبر والبوستات بتتكتب لوحدها من أرقام كل فعالية — راجع وانشر" back="/staff/site" />
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading && !data ? (
        <Loading />
      ) : (
        <div className="grid gap-4" data-testid="media-desk">
          <Card className="text-sm text-mist">
            {waiting.length ? `${waiting.length} فعالية خلصت ومستنية خبرها على الموقع.` : "كل الفعاليات اللي خلصت ليها خبر ✓"}
            {coming.length ? ` · ${coming.length} جاية: بوست الدعوة جاهز.` : ""} الكلام كله من الأرقام الحقيقية (التسجيل، الحضور بالـ QR، التقييمات) — مفيش حاجة متألفة.
          </Card>
          {!!data?.length && <MonthReport events={data} setup={collegeSetup} />}
          {!data?.length && <Empty icon="calendar" title="مفيش فعاليات قريبة" body="أي فورم ليه ميعاد فعالية أو اتسجّل فيه حضور بالـ QR بيظهر هنا." />}
          {coming.map((e) => (
            <EventCard key={e.key} e={e} me={me} onDone={reload} />
          ))}
          {past.map((e) => (
            <EventCard key={e.key} e={e} me={me} onDone={reload} college={collegeSetup} onCollege={setSetup} />
          ))}
        </div>
      )}
    </>
  );
}

function EventCard({ e, me, onDone, college, onCollege }: { e: Row; me: StaffRow; onDone: () => void; college?: CollegeSetup; onCollege?: (s: CollegeSetup) => void }) {
  const admin = can(me, "publish");
  const past = isPast(e);
  const news = useMemo(() => newsAfter(e), [e]);
  const caps = useMemo(() => captions(e), [e]);
  const [open, setOpen] = useState(past && !e.post);
  const [net, setNet] = useState<keyof Captions>("facebook");
  const [title, setTitle] = useState(news.title);
  const [body, setBody] = useState(news.body);
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  // The event's photos, fetched once, ready for the share sheet with the post's words.
  const [pics, setPics] = useState<File[] | null>(null);
  const [getting, setGetting] = useState(false);

  const getPics = async () => {
    setGetting(true);
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
        .limit(PICS)
        .then(must)) ?? []) as { image_path: string }[];
      const name = e.title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40) || "buildx";
      const files = (await Promise.allSettled(rows.map((r, i) => fileFromUrl(siteImageUrl(r.image_path), `${name}-${i + 1}`).then(asJpeg))))
        .flatMap((x) => (x.status === "fulfilled" ? [x.value] : []));
      if (!files.length) return toast("الصور ما اتحملتش — جرّب تاني", "error");
      setPics(files);
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setGetting(false);
    }
  };

  const sharePics = async () => {
    const r = await sharePhotos(pics ?? [], caps[net]);
    if (r !== "cancelled") toast(r === "shared" ? "اتبعت ✓ (والكلام اتنسخ لو التطبيق ما خدهوش)" : "الصور اتحفظت والكلام اتنسخ", "ok");
  };
  const sendWords = async () => {
    const r = await shareWords(caps[net]);
    if (r === "saved") toast("اتنسخ — الصقه في البوست", "ok");
  };

  const save = async () => {
    if (!title.trim() || !body.trim()) return toast("اكتب العنوان والخبر", "error");
    setBusy(true);
    try {
      await sb()
        .from("site_content")
        .insert({
          kind: "post",
          slug: `news-${uid().slice(0, 8)}`,
          title: "",
          title_ar: title.trim(),
          summary_ar: firstLine(body),
          body_ar: body.trim(),
          image_path: e.cover,
          // The desk knows this event has its post (under any of its keys).
          tags: e.keys.map((k) => `event:${k}`),
          ...(admin ? { published: publish } : {}),
        })
        .then(must);
      toast(admin && publish ? "الخبر اتنشر على الموقع ✅" : "الخبر اتحفظ مسودة في «محتوى الموقع»", "ok");
      onDone();
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const status = e.post ? (e.post.published ? ["ok", "الخبر منشور"] : ["info", "الخبر مسودة"]) : past ? ["warn", "مستني خبر"] : ["muted", "جاية"];
  return (
    <Card className="grid gap-3" data-testid={`desk-${e.key}`}>
      <button type="button" className="flex flex-wrap items-center gap-2 text-start" onClick={() => setOpen(!open)} aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-chalk">{e.title}</p>
          <p className="text-xs text-fog">
            {arDay(e.at)}
            {e.place ? ` · ${e.place}` : ""}
          </p>
        </div>
        <Badge tone={status[0] as "ok" | "info" | "warn" | "muted"}>{status[1]}</Badge>
      </button>
      <div className="flex flex-wrap gap-1.5 text-xs text-mist">
        {e.registered > 0 && <span className="rounded-full bg-white/5 px-2 py-0.5">{`سجّلوا ${e.registered}`}</span>}
        {e.attended > 0 && <span className="rounded-full bg-white/5 px-2 py-0.5">{`حضروا ${e.attended}`}</span>}
        {e.sessions > 1 && <span className="rounded-full bg-white/5 px-2 py-0.5">{`${e.sessions} جلسات`}</span>}
        {e.bus && <span className="rounded-full bg-white/5 px-2 py-0.5">بالأتوبيس</span>}
        {e.ratings > 0 && <span className="rounded-full bg-white/5 px-2 py-0.5">{`⭐ ${e.rating} (${e.ratings})`}</span>}
        <span className="rounded-full bg-white/5 px-2 py-0.5">{e.photos ? `📸 ${e.photos} صورة` : "مفيش صور لسه"}</span>
      </div>
      {open && (
        <div className="grid gap-4 border-t border-[var(--line)] pt-3">
          {past && !e.post && (
            <div className="grid gap-3" data-testid="desk-news">
              <p className="text-sm font-semibold text-chalk">خبر الموقع</p>
              <Field label="العنوان">
                <Input value={title} maxLength={160} onChange={(x) => setTitle(x.target.value)} />
              </Field>
              <Field label="الخبر" hint="اتكتب من أرقام الفعالية — عدّل فيه براحتك قبل ما تحفظ.">
                <Textarea rows={8} value={body} onChange={(x) => setBody(x.target.value)} data-testid="desk-news-body" />
              </Field>
              {admin && <Toggle checked={publish} onChange={setPublish} label="انشره على الموقع على طول" hint="لو قفلته هيتحفظ مسودة تراجعها في «محتوى الموقع»." />}
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" loading={busy} onClick={() => void save()} data-testid="desk-news-save">
                  {admin && publish ? "انشر الخبر" : "احفظه مسودة"}
                </Button>
                {!e.photos && (
                  <Button icon="image" onClick={() => go("/staff/photo-frame")}>
                    ارفع صور الفعالية
                  </Button>
                )}
              </div>
            </div>
          )}
          <div className="grid gap-2" data-testid="desk-captions">
            <p className="text-sm font-semibold text-chalk">{past ? "بوستات بعد الفعالية" : "بوست الدعوة"}</p>
            <div className="flex flex-wrap gap-2">
              {NETS.map(([k, label]) => (
                <Chip key={k} active={net === k} onClick={() => setNet(k)}>
                  {label}
                </Chip>
              ))}
            </div>
            <Textarea rows={8} readOnly value={caps[net]} dir={net === "linkedin" ? "auto" : "rtl"} data-testid="desk-caption" />
            <div className="flex flex-wrap gap-2">
              {e.photos > 0 &&
                (pics ? (
                  <Button size="sm" variant="primary" icon="share" onClick={() => void sharePics()} data-testid="desk-share">
                    {`شارك ${pics.length} صورة + الكلام`}
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" icon="image" loading={getting} onClick={() => void getPics()} data-testid="desk-share-prepare">
                    {`جهّز الصور للمشاركة (${Math.min(e.photos, PICS)})`}
                  </Button>
                ))}
              {e.photos > 0 && (
                <Button size="sm" icon="link" onClick={() => copyText(`${SITE}/ar/gallery/?album=${encodeURIComponent(e.title)}`, "رابط صور الفعالية اتنسخ — ابعته لأي حد")} data-testid="desk-album-link">
                  رابط صور الفعالية
                </Button>
              )}
              <Button size="sm" icon="share" onClick={() => void sendWords()} data-testid="desk-share-text">
                شارك الكلام
              </Button>
              <Button size="sm" icon="copy" onClick={() => copyText(caps[net], "اتنسخ — الصقه في البوست")}>
                انسخ
              </Button>
              <a className="btn btn-sm" href={`https://wa.me/?text=${encodeURIComponent(caps.whatsapp)}`} target="_blank" rel="noreferrer">
                ابعته على واتساب
              </a>
              <span className="self-center text-xs text-fog">{hashtags(e).join(" ")}</span>
            </div>
          </div>
          {past && college && onCollege && (
            <div className="border-t border-[var(--line)] pt-3">
              <CollegePostPanel e={e} setup={college} me={me} onSetup={onCollege} />
            </div>
          )}
          <div className="border-t border-[var(--line)] pt-3">{past ? <EventCarousel e={e} caption={caps.instagram} /> : <SoonCarousel e={e} caption={caps.instagram} />}</div>
          {past && (
            <Button icon="film" onClick={() => go(`/staff/montage?title=${encodeURIComponent(e.title_en?.trim() || e.title)}&sub=${encodeURIComponent([e.place, arDay(e.at)].filter(Boolean).join(" · "))}`)} data-testid="desk-montage">
              مونتاج فيديو للفعالية
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
