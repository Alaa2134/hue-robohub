"use client";
/** Staff review of website applications: filter, read, change status, take notes, reach the applicant. */
import { useMemo, useState } from "react";
import { DAYS, HEARD_FROM, HOURS, LEVELS, STATUSES, TEAM_ROLES, YEARS, label } from "@/content/application";
import { coreTracks } from "@/content/core-content";
import { whatsappLink } from "@/lib/contact";
import { downloadCsv, fmt, must, sb, today, type StaffRow } from "./core";
import { Badge, Button, Card, Chip, Empty, ErrorBox, Icon, List, Loading, Row, SearchBox, Section, Textarea, TopBar, confirmDialog, copyText, go, toast, useAsync } from "./ui";

type Status = (typeof STATUSES)[number]["key"];
export type Application = {
  id: string;
  ref: string;
  created_at: string;
  locale: "ar" | "en";
  full_name: string;
  phone: string;
  email: string;
  faculty: string;
  academic_year: string;
  student_number: string | null;
  track_first: string;
  track_second: string | null;
  team_roles: string[];
  experience_level: string;
  skills: string | null;
  experience: string | null;
  portfolio_url: string | null;
  motivation: string;
  goals: string | null;
  hours_per_week: string;
  days: string[];
  heard_from: string | null;
  status: Status;
  staff_notes: string;
  reviewed_at: string | null;
};

const TONE: Record<Status, "info" | "volt" | "ok" | "warn" | "danger" | "muted"> = {
  new: "info",
  contacted: "volt",
  interview: "volt",
  accepted: "ok",
  waitlist: "warn",
  rejected: "danger",
};
const statusAr = (s: string) => STATUSES.find((x) => x.key === s)?.ar ?? s;
export const trackAr = (slug: string | null | undefined) => (slug ? (coreTracks.find((t) => t.slug === slug)?.nameAr ?? slug) : "");

/** Count of applications nobody has looked at yet (home dashboard). */
export async function newApplicationsCount(): Promise<number> {
  const r = await sb().from("applications").select("id", { count: "exact", head: true }).eq("status", "new");
  return r.count ?? 0;
}

export function ApplicationsScreen() {
  const { data, error, loading, reload } = useAsync(async () => (await sb().from("applications").select("*").order("created_at", { ascending: false }).limit(1000).then(must)) as Application[], []);
  const [status, setStatus] = useState<Status | "all">("all");
  const [track, setTrack] = useState("");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data?.length ?? 0 };
    for (const a of data ?? []) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [data]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data ?? []).filter(
      (a) =>
        (status === "all" || a.status === status) &&
        (!track || a.track_first === track || a.track_second === track) &&
        (!needle || [a.full_name, a.phone, a.email, a.ref, a.faculty].some((v) => v?.toLowerCase().includes(needle))),
    );
  }, [data, status, track, q]);

  const exportCsv = () => {
    downloadCsv(`buildx-applications-${today()}.csv`, [
      ["الرقم", "التاريخ", "الحالة", "الاسم", "الموبايل", "الإيميل", "الكلية", "السنة", "الرقم الجامعي", "المسار الأول", "المسار التاني", "المستوى", "المهارات", "الخبرة", "لينك", "الدافع", "الأهداف", "ساعات/أسبوع", "الأيام", "أدوار تنظيمية", "عرف منين", "ملاحظات الفريق"],
      ...list.map((a) => [
        a.ref,
        fmt.dateTime(a.created_at),
        statusAr(a.status),
        a.full_name,
        a.phone,
        a.email,
        a.faculty,
        label(YEARS, a.academic_year, "ar"),
        a.student_number,
        trackAr(a.track_first),
        trackAr(a.track_second),
        label(LEVELS, a.experience_level, "ar"),
        a.skills,
        a.experience,
        a.portfolio_url,
        a.motivation,
        a.goals,
        label(HOURS, a.hours_per_week, "ar"),
        a.days.map((d) => label(DAYS, d, "ar")).join("، "),
        a.team_roles.map((r) => label(TEAM_ROLES, r, "ar")).join("، "),
        label(HEARD_FROM, a.heard_from, "ar"),
        a.staff_notes,
      ]),
    ]);
  };

  return (
    <>
      <TopBar
        title="طلبات الانضمام"
        sub={data ? `${data.length} طلب · ${counts.new ?? 0} جديد` : undefined}
        actions={
          <Button size="sm" icon="download" onClick={exportCsv} disabled={!list.length}>
            Excel
          </Button>
        }
      />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : !data?.length ? (
        <Empty icon="users" title="مفيش طلبات لسه" body="أول ما طالب يقدّم من صفحة «انضم» على الموقع، طلبه هيظهر هنا." />
      ) : (
        <>
          <SearchBox value={q} onChange={setQ} placeholder="اسم، موبايل، إيميل أو رقم الطلب…" />
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            <Chip active={status === "all"} onClick={() => setStatus("all")} count={counts.all}>
              الكل
            </Chip>
            {STATUSES.map((s) => (
              <Chip key={s.key} active={status === s.key} onClick={() => setStatus(s.key)} count={counts[s.key] ?? 0}>
                {s.ar}
              </Chip>
            ))}
          </div>
          <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            <Chip active={!track} onClick={() => setTrack("")}>
              كل المسارات
            </Chip>
            {coreTracks.map((t) => (
              <Chip key={t.slug} active={track === t.slug} onClick={() => setTrack(t.slug)}>
                {t.nameAr}
              </Chip>
            ))}
          </div>
          {list.length ? (
            <List className="mt-4">
              {list.map((a) => (
                <Row key={a.id} onClick={() => go(`/staff/applications/${a.id}`)}>
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate font-semibold text-chalk">
                        {a.status === "new" && <span className="size-2 shrink-0 rounded-full bg-cyan" />}
                        {a.full_name}
                      </p>
                      <p className="truncate text-xs text-fog">
                        {trackAr(a.track_first)} · {a.faculty} · {fmt.rel(a.created_at)}
                      </p>
                    </div>
                    <Badge tone={TONE[a.status]}>{statusAr(a.status)}</Badge>
                  </div>
                </Row>
              ))}
            </List>
          ) : (
            <Card className="mt-4 text-center text-sm text-mist">مفيش طلبات بالفلتر ده.</Card>
          )}
        </>
      )}
    </>
  );
}

function Item({ k, v, ltr }: { k: string; v: React.ReactNode; ltr?: boolean }) {
  if (v == null || v === "" || (Array.isArray(v) && !v.length)) return null;
  return (
    <div className="flex flex-col gap-0.5 border-b border-[var(--line)] py-2.5 last:border-0">
      <span className="text-xs text-fog">{k}</span>
      <span className="whitespace-pre-line break-words text-[15px] text-chalk" dir={ltr ? "ltr" : undefined}>
        {v}
      </span>
    </div>
  );
}

export function ApplicationDetail({ id, me }: { id: string; me: StaffRow }) {
  const { data: a, error, loading, reload, set } = useAsync(async () => (await sb().from("applications").select("*").eq("id", id).single().then(must)) as Application, [id]);
  const [notes, setNotes] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading && !a) return <Loading />;
  if (error || !a) return <ErrorBox error={error ?? "الطلب مش موجود"} retry={reload} />;

  const save = async (patch: Partial<Pick<Application, "status" | "staff_notes">>, okText: string) => {
    setBusy(true);
    try {
      const row = (await sb().from("applications").update(patch).eq("id", a.id).select("*").single().then(must)) as Application;
      set(row);
      toast(okText);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: `حذف طلب ${a.full_name}؟`, body: "الطلب هيتمسح نهائياً. لو مش مناسب، الأفضل تخلي حالته «مرفوض».", ok: "حذف نهائي", danger: true }))) return;
    try {
      await sb().from("applications").delete().eq("id", a.id).then(must);
      toast("اتمسح الطلب");
      go("/staff/applications", true);
    } catch (e) {
      toast.error(e);
    }
  };

  const first = a.full_name.split(/\s+/)[0];
  const wa = whatsappLink(a.phone, `أهلاً ${first}، معاك فريق BuildX HUE بخصوص طلب الانضمام رقم ${a.ref}.`);
  const noteValue = notes ?? a.staff_notes;

  return (
    <>
      <TopBar title={a.full_name} sub={`${a.ref} · ${fmt.dateTime(a.created_at)}`} back="/staff/applications" />

      <div className="flex flex-wrap gap-2">
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#1fa855] px-4 font-semibold text-white">
            <Icon name="mail" size={18} />
            واتساب
          </a>
        )}
        <a href={`tel:${a.phone}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--line-2)] px-4 font-semibold text-chalk">
          اتصال
        </a>
        <a href={`mailto:${a.email}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--line-2)] px-4 font-semibold text-chalk">
          إيميل
        </a>
        <Button size="sm" variant="ghost" onClick={() => copyText(a.phone)}>
          نسخ الرقم
        </Button>
      </div>

      <Section title="الحالة">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <Chip key={s.key} active={a.status === s.key} onClick={() => !busy && a.status !== s.key && save({ status: s.key }, `الحالة: ${s.ar}`)}>
              {s.ar}
            </Chip>
          ))}
        </div>
        {a.reviewed_at && <p className="mt-2 text-xs text-fog">آخر مراجعة {fmt.rel(a.reviewed_at)}</p>}
      </Section>

      <Section title="ملاحظات الفريق">
        <Textarea value={noteValue} onChange={(e) => setNotes(e.target.value)} maxLength={4000} placeholder="مثلاً: كلمناه يوم الأحد، ميعاد المقابلة…" className="min-h-24" />
        <Button size="sm" className="mt-2" loading={busy} disabled={noteValue === a.staff_notes} onClick={() => save({ staff_notes: noteValue }, "اتحفظت الملاحظات")}>
          حفظ الملاحظات
        </Button>
      </Section>

      <Section title="بياناته">
        <Card>
          <Item k="الموبايل" v={a.phone} ltr />
          <Item k="الإيميل" v={a.email} ltr />
          <Item k="الكلية" v={a.faculty} />
          <Item k="السنة" v={label(YEARS, a.academic_year, "ar")} />
          <Item k="الرقم الجامعي" v={a.student_number} ltr />
          <Item k="لغة الفورم" v={a.locale === "en" ? "English" : "عربي"} />
        </Card>
      </Section>

      <Section title="اهتماماته">
        <Card>
          <Item k="المسار الأول" v={trackAr(a.track_first)} />
          <Item k="المسار التاني" v={trackAr(a.track_second)} />
          <Item k="المستوى" v={label(LEVELS, a.experience_level, "ar")} />
          <Item k="المهارات" v={a.skills} />
          <Item k="الخبرة السابقة" v={a.experience} />
          <Item
            k="لينك شغله"
            v={
              a.portfolio_url && /^https?:\/\//.test(a.portfolio_url) ? (
                <a href={a.portfolio_url} target="_blank" rel="noopener noreferrer nofollow" className="text-cyan underline">
                  {a.portfolio_url}
                </a>
              ) : (
                a.portfolio_url
              )
            }
            ltr
          />
          <Item k="أدوار تنظيمية مهتم بيها" v={a.team_roles.map((r) => label(TEAM_ROLES, r, "ar")).join("، ")} />
        </Card>
      </Section>

      <Section title="دافعه ووقته">
        <Card>
          <Item k="ليه عايز ينضم" v={a.motivation} />
          <Item k="عايز يبني / يتعلّم إيه" v={a.goals} />
          <Item k="ساعات في الأسبوع" v={label(HOURS, a.hours_per_week, "ar")} />
          <Item k="الأيام المناسبة" v={a.days.map((d) => label(DAYS, d, "ar")).join("، ")} />
          <Item k="عرف عنّا منين" v={label(HEARD_FROM, a.heard_from, "ar")} />
        </Card>
      </Section>

      {me.role !== "lead" && (
        <Button variant="danger" icon="trash" className="mt-8" block onClick={remove}>
          حذف الطلب
        </Button>
      )}
    </>
  );
}
