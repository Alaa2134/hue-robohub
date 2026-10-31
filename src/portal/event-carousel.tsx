"use client";
/**
 * The event carousel (media desk): an 8-slide Instagram post in the BuildX style for any event —
 * the cover, the arrival, highlights, in action, the team, behind the scenes, the family and thank
 * you. The photos come from the event's album on the site or straight from the phone; which goes
 * where is picked by image maths (src/lib/carousel.ts), the words come from the event and can be
 * changed. Drawn on the device (src/portal/carousel-draw.ts), then saved, shared or zipped.
 */
import { useEffect, useRef, useState } from "react";
import { assignPhotos, type CarouselKind, type CarouselText, type SlideKey } from "@/lib/carousel";
import { guessKind } from "@/lib/college-post";
import { look } from "@/lib/photo-frame";
import { skinShare } from "@/lib/photo-pick";
import { siteImageUrl } from "@/lib/site-content";
import { zipStore } from "@/lib/zip-store";
import { download, errorText, fmt, must, sb, sharePhotos, today } from "./core";
import { renderCarousel, toPic, type Pic, type Slides } from "./carousel-draw";
import { Button, Field, Icon, Input, Select, toast } from "./ui";

const KINDS: [CarouselKind, string][] = [
  ["competition", "مسابقة"],
  ["summit", "قمة"],
  ["conference", "مؤتمر"],
  ["workshop", "ورشة"],
  ["course", "كورس"],
  ["visit", "زيارة"],
  ["talk", "محاضرة"],
  ["event", "فعالية"],
];
const NAMES: Record<SlideKey, string> = { cover: "الغلاف", arrival: "الوصول", highlights: "أهم اللحظات", action: "في الملعب", team: "الفريق", behind: "ورا الكواليس", family: "العيلة", thanks: "شكرًا" };
const MAX = 40;

const enDate = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Cairo" }).format(new Date(iso));

export function EventCarousel({ e, caption }: { e: { key: string; title: string; title_en?: string | null; at: string; place?: string | null; photos: number; bus?: boolean }; caption: string }) {
  const guess = guessKind(e.title);
  const [text, setText] = useState<CarouselText>({
    title: e.title_en?.trim() || e.title,
    tagline: "Our Journey",
    place: e.place ?? "",
    date: enDate(e.at),
    kind: (KINDS.some(([k]) => k === guess.kind) ? guess.kind : "event") as CarouselKind,
    from: e.bus ? "From our campus" : "",
  });
  const [picked, setPicked] = useState<Blob[]>([]);
  const [busy, setBusy] = useState("");
  const [slides, setSlides] = useState<{ key: SlideKey; blob: Blob; url: string }[] | null>(null);
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const fromAlbum = async () => {
    setBusy("بيجيب صور الفعالية…");
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
        .limit(MAX)
        .then(must)) ?? []) as { image_path: string }[];
      const got = (await Promise.allSettled(rows.map((r) => fetch(siteImageUrl(r.image_path)).then((x) => (x.ok ? x.blob() : Promise.reject(new Error(String(x.status))))))))
        .flatMap((x) => (x.status === "fulfilled" ? [x.value] : []));
      if (!got.length) toast("مفيش صور للفعالية على الموقع — اختار من الموبايل", "info");
      setPicked(got);
      setSlides(null);
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setBusy("");
    }
  };

  const make = async () => {
    setBusy("بيختار الصور ويرسم الشرايح…");
    try {
      const pics: Pic[] = [];
      for (const b of picked) {
        try {
          pics.push(await toPic(b));
        } catch {
          /* an unreadable file: left out */
        }
      }
      const where = assignPhotos(pics.map((p) => ({ w: p.w, h: p.h, look: { ...look(p.small.px, p.small.w, p.small.h), skin: skinShare(p.small.px) } })));
      const byKey: Slides = Object.fromEntries(Object.entries(where).map(([k, list]) => [k, (list ?? []).map((i) => pics[i])]));
      const out = await renderCarousel(text, byKey, e.key);
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      const made = out.map((s) => ({ ...s, url: URL.createObjectURL(s.blob) }));
      urls.current = made.map((s) => s.url);
      setSlides(made);
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setBusy("");
    }
  };

  const files = () => (slides ?? []).map((s, i) => new File([s.blob], `carousel-${i + 1}-${s.key}.jpg`, { type: "image/jpeg" }));
  const share = async () => {
    const r = await sharePhotos(files(), caption);
    if (r !== "cancelled") toast(r === "shared" ? "اتبعت ✓" : `اتحفظت ${slides?.length ?? 0} شريحة`, "ok");
  };
  const zip = async () => {
    const entries = await Promise.all(files().map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })));
    download(zipStore(entries), `carousel-${today()}.zip`);
  };

  const set = (k: keyof CarouselText) => (x: { target: { value: string } }) => (setText({ ...text, [k]: x.target.value }), setSlides(null));
  return (
    <div className="grid gap-3" data-testid="desk-carousel">
      <p className="text-sm font-semibold text-chalk">كاروسيل الإنستجرام (8 شرايح بتصميم BuildX)</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="اسم الفعالية على الغلاف">
          <Input value={text.title} maxLength={60} onChange={set("title")} data-testid="carousel-title" />
        </Field>
        <Field label="كانت إيه">
          <Select value={text.kind} onChange={set("kind")}>
            {KINDS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="المكان">
          <Input value={text.place} maxLength={50} placeholder="E-JUST, Alexandria" onChange={set("place")} />
        </Field>
        <Field label="التاريخ">
          <Input value={text.date} maxLength={30} onChange={set("date")} />
        </Field>
        <Field label="السطر اللي تحت الاسم">
          <Input value={text.tagline} maxLength={30} onChange={set("tagline")} />
        </Field>
        <Field label="منين (في شريحة الوصول)" hint="سيبه فاضي لو مفيش سفر">
          <Input value={text.from} maxLength={40} placeholder="From Horus University" onChange={set("from")} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {e.photos > 0 && (
          <Button size="sm" icon="image" disabled={!!busy} onClick={() => void fromAlbum()} data-testid="carousel-album">
            {`صور الفعالية من الموقع (${Math.min(e.photos, MAX)})`}
          </Button>
        )}
        <label className="btn btn-sm cursor-pointer">
          <Icon name="upload" size={16} />
          اختار صور من الموبايل
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            data-testid="carousel-photos"
            onChange={(x) => {
              setPicked(Array.from(x.target.files ?? []).slice(0, MAX));
              setSlides(null);
              x.target.value = "";
            }}
          />
        </label>
        <span className="text-xs text-fog">{picked.length ? `${picked.length} صورة (${fmt.size(picked.reduce((n, b) => n + b.size, 0))})` : "18 صورة بتملا كل الشرايح؛ أقل من كده بتطلع الشرايح اللي ليها صور بس."}</span>
      </div>
      <Button variant="primary" icon="image" loading={!!busy} disabled={!picked.length} onClick={() => void make()} data-testid="carousel-make">
        {busy || "اعمل الكاروسيل"}
      </Button>
      {slides && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="carousel-slides">
            {slides.map((s) => (
              <figure key={s.key} className="overflow-hidden rounded-lg border border-[var(--line)]">
                <img src={s.url} alt={NAMES[s.key]} className="w-full" data-testid={`carousel-slide-${s.key}`} />
                <figcaption className="px-2 py-1 text-xs text-fog">{NAMES[s.key]}</figcaption>
              </figure>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon="share" onClick={() => void share()} data-testid="carousel-share">
              {`احفظ / شارك الـ ${slides.length} شرايح`}
            </Button>
            <Button icon="download" onClick={() => void zip()} data-testid="carousel-zip">
              نزّلهم ZIP
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
