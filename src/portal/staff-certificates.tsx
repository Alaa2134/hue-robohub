"use client";
/** BuildX App → certificates: issue (one name, a list of names, or students picked from the app), print, revoke. */
import { useMemo, useState } from "react";
import { CERT_DESIGNS, CERT_KINDS, CertificatePrint, certArt, designKeyFor, verifyUrl, type Certificate } from "./certificate";
import { errorText, fmt, must, sb, today, type StaffRow } from "./core";
import { useStudents } from "./staff-data";
import { Badge, Button, Card, Chip, Empty, ErrorBox, Field, IconButton, Input, List, Loading, Row, SearchBox, Sheet, Textarea, TopBar, confirmDialog, copyText, go, toast, useAsync } from "./ui";

type Row_ = Certificate & { student_id: string | null; revoked_at: string | null; created_at: string };

const COLS = "id,code,name:recipient_name,kind,title,title_ar,details,details_ar,hours,issued_on,design,student_id,revoked_at,created_at";
const kindAr = (k: string) => CERT_KINDS.find((x) => x.key === k)?.ar ?? k;

export function CertificatesScreen({ me }: { me: StaffRow }) {
  const { data, error, loading, reload } = useAsync(async () => (await sb().from("certificates").select(COLS).order("created_at", { ascending: false }).limit(2000).then(must)) as Row_[], []);
  const [q, setQ] = useState("");
  const [issuing, setIssuing] = useState(false);
  const admin = me.role !== "lead";

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (data ?? []).filter((c) => !n || [c.name, c.title, c.title_ar, c.code].some((v) => v?.toLowerCase().includes(n)));
  }, [data, q]);

  const revoke = async (c: Row_) => {
    if (!(await confirmDialog({ title: `إلغاء شهادة ${c.name}؟`, body: "صفحة التحقق هتقول إن الشهادة دي اتلغت. مش هتختفي من السجل.", ok: "إلغاء الشهادة", danger: true }))) return;
    try {
      await sb().from("certificates").update({ revoked_at: new Date().toISOString() }).eq("id", c.id).then(must);
      toast("اتلغت");
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };

  const print = (ids: string[]) => go(`/staff/certificates/print?ids=${ids.join(",")}`);

  return (
    <>
      <TopBar
        title="الشهادات"
        sub={data ? `${data.length} شهادة` : undefined}
        back="/staff/more"
        actions={
          <Button size="sm" variant="primary" icon="plus" onClick={() => setIssuing(true)}>
            إصدار
          </Button>
        }
      />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : !data?.length ? (
        <Empty icon="award" title="لسه مفيش شهادات" body="اصدر شهادات لطلاب البوتكامب أو المشاركين في فعالية. كل شهادة عليها QR بيفتح صفحة تحقق على الموقع." />
      ) : (
        <>
          <SearchBox value={q} onChange={setQ} placeholder="اسم، عنوان الشهادة أو الكود…" />
          {q.trim() && list.length > 1 && (
            <Button size="sm" variant="ghost" icon="download" className="mt-2" onClick={() => print(list.filter((c) => !c.revoked_at).slice(0, 60).map((c) => c.id))}>
              اطبع النتايج ({Math.min(60, list.filter((c) => !c.revoked_at).length)})
            </Button>
          )}
          <List className="mt-3">
            {list.map((c) => (
              <Row key={c.id} chevron={false}>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-chalk">{c.name}</p>
                    <p className="truncate text-xs text-fog">
                      {kindAr(c.kind)} · {c.title_ar || c.title} · {fmt.short(`${c.issued_on}T12:00:00`)}
                    </p>
                    <p className="font-mono text-[11px] text-fog" dir="ltr">
                      {c.code}
                    </p>
                  </div>
                  {c.revoked_at ? (
                    <Badge tone="danger">ملغية</Badge>
                  ) : (
                    <>
                      <IconButton icon="download" label="طباعة" onClick={() => print([c.id])} />
                      <IconButton icon="link" label="نسخ لينك التحقق" onClick={() => copyText(verifyUrl(c.code))} />
                      {admin && <IconButton icon="trash" label="إلغاء" onClick={() => revoke(c)} />}
                    </>
                  )}
                </div>
              </Row>
            ))}
          </List>
        </>
      )}
      {issuing && (
        <IssueSheet
          onClose={() => setIssuing(false)}
          onDone={(ids) => {
            setIssuing(false);
            reload();
            print(ids);
          }}
        />
      )}
    </>
  );
}

function IssueSheet({ onClose, onDone }: { onClose: () => void; onDone: (ids: string[]) => void }) {
  const students = useStudents();
  const [kind, setKind] = useState<Certificate["kind"]>("completion");
  const [title, setTitle] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [details, setDetails] = useState("");
  const [detailsAr, setDetailsAr] = useState("");
  const [hours, setHours] = useState("");
  const [date, setDate] = useState(today());
  // "" follows the kind and title (Appreciation, or the track named in the title).
  const [design, setDesign] = useState("");
  const autoDesign = designKeyFor({ kind, title, title_ar: titleAr, design: null });
  const chosenDesign = design || autoDesign;
  const [mode, setMode] = useState<"students" | "names">("students");
  const [group, setGroup] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [names, setNames] = useState("");
  const [busy, setBusy] = useState(false);

  const active = useMemo(() => (students.list ?? []).filter((s) => s.active), [students.list]);
  const groups = useMemo(() => [...new Set(active.map((s) => s.group).filter(Boolean))].sort(), [active]);
  const shown = active.filter((s) => !group || s.group === group);
  const toggle = (id: string) => setPicked((p) => (p.has(id) ? new Set([...p].filter((x) => x !== id)) : new Set([...p, id])));

  const recipients =
    mode === "students"
      ? active.filter((s) => picked.has(s.id)).map((s) => ({ name: s.name, student_id: s.id as string | null }))
      : names
          .split("\n")
          .map((n) => n.trim())
          .filter((n) => n.length >= 2)
          .map((name) => ({ name, student_id: null as string | null }));

  const issue = async () => {
    if (title.trim().length < 2) return toast("اكتب عنوان الشهادة (مثلاً: Robotics Bootcamp 2026)", "error");
    if (!recipients.length) return toast(mode === "students" ? "اختار طالب واحد على الأقل" : "اكتب اسم واحد على الأقل", "error");
    if (recipients.length > 300) return toast("أقصى حد 300 شهادة في المرة", "error");
    const h = hours.trim() ? Number(hours) : null;
    if (h !== null && !(h >= 1 && h <= 2000)) return toast("عدد الساعات من 1 لـ 2000", "error");
    setBusy(true);
    try {
      const rows = recipients.map((r) => ({
        recipient_name: r.name,
        student_id: r.student_id,
        kind,
        title: title.trim(),
        title_ar: titleAr.trim() || null,
        details: details.trim() || null,
        details_ar: detailsAr.trim() || null,
        hours: h,
        issued_on: date,
        design: chosenDesign,
      }));
      const out = (await sb().from("certificates").insert(rows).select("id").then(must)) as { id: string }[];
      toast(`اتصدرت ${out.length} شهادة ✓`);
      onDone(out.slice(0, 60).map((r) => r.id));
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title="إصدار شهادات" wide>
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          {CERT_KINDS.map((k) => (
            <Chip key={k.key} active={kind === k.key} onClick={() => setKind(k.key)}>
              {k.ar}
            </Chip>
          ))}
        </div>
        <Field label="عنوان الشهادة (English)" hint="بيظهر بخط كبير. مثلاً: Robotics & Embedded Bootcamp 2026">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} dir="ltr" />
        </Field>
        <Field label="العنوان بالعربي (اختياري)">
          <Input value={titleAr} onChange={(e) => setTitleAr(e.target.value)} maxLength={140} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="تفاصيل (English، اختياري)">
            <Input value={details} onChange={(e) => setDetails(e.target.value)} maxLength={300} dir="ltr" placeholder="Fall 2026 · Horus University" />
          </Field>
          <Field label="تفاصيل بالعربي (اختياري)">
            <Input value={detailsAr} onChange={(e) => setDetailsAr(e.target.value)} maxLength={300} />
          </Field>
          <Field label="عدد الساعات (اختياري)">
            <Input value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, ""))} inputMode="numeric" dir="ltr" maxLength={4} />
          </Field>
          <Field label="تاريخ الإصدار">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" />
          </Field>
        </div>

        <Field label="تصميم الشهادة" hint={design ? undefined : "بيتختار لوحده من النوع والعنوان. دوس على تصميم لو عايز غيره."}>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {[...CERT_DESIGNS.map((d) => ({ key: d.key, ar: d.ar })), { key: "classic", ar: "الكلاسيكي" }].map((d) => {
              const on = chosenDesign === d.key;
              return (
                <button
                  key={d.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDesign(design === d.key ? "" : d.key)}
                  className={`w-28 shrink-0 overflow-hidden rounded-xl border text-start transition ${on ? "border-cyan ring-2 ring-cyan/40" : "border-[var(--line-2)] opacity-75 hover:opacity-100"}`}
                >
                  {d.key === "classic" ? (
                    <span className="flex aspect-[297/210] items-center justify-center bg-[#081634] text-[11px] font-bold tracking-widest text-[#e8c77a]">BUILDX</span>
                  ) : (
                    <img src={certArt(d.key)} alt="" loading="lazy" className="block aspect-[297/210] w-full object-cover" />
                  )}
                  <span className="block truncate px-2 py-1.5 text-xs text-mist">
                    {d.ar}
                    {!design && on ? " · تلقائي" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </Field>

        <div className="flex gap-2">
          <Chip active={mode === "students"} onClick={() => setMode("students")}>
            طلاب من التطبيق
          </Chip>
          <Chip active={mode === "names"} onClick={() => setMode("names")}>
            أسماء بإيدي
          </Chip>
        </div>
        {mode === "names" ? (
          <Field label="الأسماء — اسم في كل سطر" hint="لمشاركين مش متسجلين في التطبيق (فعالية، ورشة…)">
            <Textarea value={names} onChange={(e) => setNames(e.target.value)} className="min-h-32" />
          </Field>
        ) : students.loading && !students.list ? (
          <Loading />
        ) : (
          <Card className="grid gap-3">
            {groups.length > 1 && (
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                <Chip active={!group} onClick={() => setGroup("")}>
                  الكل
                </Chip>
                {groups.map((g) => (
                  <Chip key={g} active={group === g} onClick={() => setGroup(g)}>
                    {g}
                  </Chip>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-mist">اتختار {picked.size}</span>
              <button type="button" className="font-semibold text-cyan" onClick={() => setPicked((p) => new Set([...p, ...shown.map((s) => s.id)]))}>
                اختار كل اللي ظاهرين ({shown.length})
              </button>
            </div>
            <ul className="grid max-h-72 gap-1 overflow-y-auto">
              {shown.map((s) => (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.04]">
                    <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} className="size-5 accent-[#2b6dff]" />
                    <span className="min-w-0 flex-1 truncate text-chalk">{s.name}</span>
                    <span className="text-xs text-fog">{s.group}</span>
                  </label>
                </li>
              ))}
              {!shown.length && <li className="p-3 text-center text-sm text-fog">مفيش طلاب.</li>}
            </ul>
          </Card>
        )}
        <Button variant="primary" size="lg" block loading={busy} onClick={issue} disabled={!recipients.length}>
          إصدار {recipients.length ? `${recipients.length} شهادة` : ""}
        </Button>
      </div>
    </Sheet>
  );
}

/** /staff/certificates/print?ids=… */
export function CertificatesPrintScreen({ ids }: { ids: string[] }) {
  const { data, error } = useAsync(async () => (ids.length ? ((await sb().from("certificates").select(COLS).in("id", ids.slice(0, 60)).then(must)) as Row_[]) : []), [ids.join(",")]);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const order = new Map(ids.map((id, i) => [id, i]));
  const certs = [...data].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return <CertificatePrint certs={certs} onBack={() => go("/staff/certificates")} />;
}
