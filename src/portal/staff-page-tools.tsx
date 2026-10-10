"use client";
/** Page builder tools: the page's numbers, show/hide times, older versions and "make a copy". */
import { useState } from "react";
import { BUILT_IN } from "@/lib/site-pages";
import { fromZonedInput, toZonedInput } from "@/lib/zoned";
import { errorText, fmt, must, rpc, sb } from "./core";
import { asPage, fromPage, type PageRow, type Version } from "./staff-pages-model";
import { Badge, Button, Card, Chip, Empty, ErrorBox, Field, Input, Loading, Sheet, Stat, go, toast, useAsync } from "./ui";

type Stats = {
  from: string;
  views: number;
  visitors: number;
  daily: { day: string; views: number }[];
  referrers: { host: string; views: number }[];
  devices: Record<string, number>;
  forms: { slug: string; title: string; total: number; period: number; accepted: number }[];
};

/** The page's numbers (loaded when opened): visits, where from, and how many applied through its forms. */
export function PageStats({ slug, forms }: { slug: string; forms: string[] }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(30);
  const { data, error, loading, reload } = useAsync(async () => (open ? rpc<Stats>("staff_page_stats", { p_slug: slug, p_forms: forms.length ? forms : null, p_days: days }) : null), [open, slug, days, forms.join()]);
  const max = Math.max(1, ...(data?.daily ?? []).map((d) => d.views));
  const applied = (data?.forms ?? []).reduce((n, f) => n + f.period, 0);
  return (
    <details className="mt-4 rounded-2xl border border-[var(--line)] bg-panel/40 p-4" data-testid="page-stats" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-sm font-semibold text-chalk">أرقام الصفحة (زيارات وتقديمات)</summary>
      <div className="mt-3 grid gap-3">
        <div className="flex gap-1.5">
          {[7, 30, 90].map((d) => (
            <Chip key={d} active={days === d} onClick={() => setDays(d)}>
              {d === 7 ? "أسبوع" : d === 30 ? "شهر" : "3 شهور"}
            </Chip>
          ))}
        </div>
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <ErrorBox error={error} retry={reload} />
        ) : data ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="زيارة" value={data.views} />
              <Stat label="زائر" value={data.visitors} />
              <Stat label="قدّموا" value={applied} tone={applied ? "ok" : undefined} sub={data.visitors ? `${Math.round((applied / data.visitors) * 100)}% من الزوار` : undefined} />
            </div>
            {data.daily.length > 0 && (
              <div className="flex h-20 items-end gap-0.5" aria-label="الزيارات كل يوم">
                {data.daily.map((d) => (
                  <span key={d.day} title={`${fmt.day(d.day)}: ${d.views}`} className="min-w-[3px] flex-1 rounded-t bg-cyan/60" style={{ height: `${Math.max(4, (d.views / max) * 100)}%` }} />
                ))}
              </div>
            )}
            {data.forms.map((f) => (
              <p key={f.slug} className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2 text-xs text-mist">
                <span className="min-w-0 truncate">{f.title}</span>
                <span className="shrink-0 text-fog">
                  {f.period} في الفترة · {f.total} الكل · {f.accepted} اتقبلوا
                </span>
              </p>
            ))}
            {data.referrers.length > 0 && (
              <p className="text-xs text-fog">
                جايين منين: {data.referrers.map((r) => `${r.host || "مباشر"} (${r.views})`).join("، ")}
              </p>
            )}
            {!data.views && <p className="text-xs text-fog">مفيش زيارات في الفترة دي لسه.</p>}
          </>
        ) : null}
      </div>
    </details>
  );
}

/** Up and down by itself: two times in Cairo time (empty = no schedule). */
export function Schedule({ row, busy, onSave }: { row: PageRow; busy: boolean; onSave: (p: Pick<PageRow, "publish_at" | "unpublish_at">) => void }) {
  const [from, setFrom] = useState(toZonedInput(row.publish_at ?? null));
  const [to, setTo] = useState(toZonedInput(row.unpublish_at ?? null));
  const changed = from !== toZonedInput(row.publish_at ?? null) || to !== toZonedInput(row.unpublish_at ?? null);
  const now = Date.now();
  const live = !row.archived && (row.published || (!!row.publish_at && new Date(row.publish_at).getTime() <= now)) && (!row.unpublish_at || new Date(row.unpublish_at).getTime() > now);
  return (
    <details className="rounded-xl border border-[var(--line-2)] p-3" data-testid="page-schedule" open={!!(row.publish_at || row.unpublish_at)}>
      <summary className="cursor-pointer text-sm font-semibold text-chalk">
        جدولة (تظهر وتختفي لوحدها) {(row.publish_at || row.unpublish_at) && <Badge tone={live ? "ok" : "info"}>{live ? "ظاهرة دلوقتي" : "مجدولة"}</Badge>}
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="تظهر على الموقع من" hint="بتوقيت القاهرة. فاضي = حسب «منشورة».">
          <Input type="datetime-local" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="وتختفي بعد" hint="مثلاً بعد ما المعرض يخلص.">
          <Input type="datetime-local" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={!changed || busy}
          onClick={() => {
            const a = fromZonedInput(from);
            const b = fromZonedInput(to);
            if (a && b && b <= a) return toast("ميعاد الاختفاء لازم يبقى بعد ميعاد الظهور", "error");
            onSave({ publish_at: a?.toISOString() ?? null, unpublish_at: b?.toISOString() ?? null });
          }}
        >
          احفظ الجدولة
        </Button>
        {(row.publish_at || row.unpublish_at) && (
          <Button size="sm" disabled={busy} onClick={() => (setFrom(""), setTo(""), onSave({ publish_at: null, unpublish_at: null }))}>
            شيل الجدولة
          </Button>
        )}
      </div>
    </details>
  );
}

/** Every save keeps the version before it: the last 30, each one can come back into the editor. */
export function VersionsSheet({ open, pageId, onClose, onRestore }: { open: boolean; pageId: string; onClose: () => void; onRestore: (v: Version) => void }) {
  const { data, error, loading, reload } = useAsync(
    async () =>
      open
        ? ((await sb().from("site_page_versions").select("id, title_ar, title_en, description_ar, description_en, accent, blocks, settings, saved_by, saved_at").eq("page_id", pageId).order("saved_at", { ascending: false }).limit(30).then(must)) as Version[])
        : null,
    [open, pageId],
  );
  return (
    <Sheet open={open} onClose={onClose} title="النسخ القديمة">
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : !data?.length ? (
        <Empty icon="refresh" title="مفيش نسخ قديمة لسه" body="كل ما تحفظ، النسخة اللي قبلها بتتحفظ هنا." />
      ) : (
        <div className="grid gap-2" data-testid="page-versions">
          {data.map((v) => (
            <Card key={v.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-chalk">{v.title_ar}</p>
                <p className="text-xs text-fog">
                  {fmt.dateTime(v.saved_at)} · {v.blocks.length} جزء
                </p>
              </div>
              <Button size="sm" onClick={() => onRestore(v)}>
                رجّعها
              </Button>
            </Card>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/** A copy of the page (as a draft) to start the next event from. */
export function DuplicateButton({ row }: { row: PageRow }) {
  const [busy, setBusy] = useState(false);
  const copy = async () => {
    setBusy(true);
    try {
      const taken = new Set(((await sb().from("site_pages").select("slug").then(must)) as { slug: string }[]).map((x) => x.slug));
      const base = `${row.slug.replace(/-copy(-\d+)?$/, "").slice(0, 40)}-copy`;
      let slug = base;
      for (let n = 2; taken.has(slug) || BUILT_IN[slug]; n++) slug = `${base}-${n}`;
      const out = (await sb()
        .from("site_pages")
        .insert({ ...fromPage(asPage(row)), slug, title_ar: `${row.title_ar} (نسخة)`.slice(0, 160), published: false })
        .select("id")
        .single()
        .then(must)) as { id: string };
      toast("اتعملت نسخة (مسودة)");
      go(`/staff/pages/${out.id}`);
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button icon="copy" loading={busy} onClick={() => void copy()}>
      اعمل نسخة من الصفحة
    </Button>
  );
}

