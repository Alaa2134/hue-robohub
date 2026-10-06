"use client";
/** Students roster: add one or many, ID-card barcode linking, PIN codes with printable login cards. */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { whatsappLink } from "@/lib/contact";
import { APP_PATH, codeKey, downloadCsv, fmt, must, rpc, sb, type StaffRow, type Student } from "./core";
import { Scanner } from "./scanner";
import { GroupSelect, groupsOf, patchStudents, refreshStudents, useStudents } from "./staff-data";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  Empty,
  ErrorBox,
  Field,
  Icon,
  IconButton,
  Input,
  List,
  Loading,
  Row,
  SearchBox,
  Sheet,
  Textarea,
  Toggle,
  TopBar,
  confirmDialog,
  copyText,
  toast,
} from "./ui";

export type PinItem = { id: string; code: string; name: string; group: string; pin: string };

const loginUrl = (code?: string) => `${window.location.origin}${APP_PATH}#/login/student${code ? `?c=${encodeURIComponent(code)}` : ""}`;

export function StudentsScreen({ me, query }: { me: StaffRow; query: URLSearchParams }) {
  const { list, error, loading, reload } = useStudents();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const [noPin, setNoPin] = useState(false);
  const [editing, setEditing] = useState<Student | "new" | null>(null);
  const [bulk, setBulk] = useState(query.get("bulk") === "1");
  const [pinsOpen, setPinsOpen] = useState(query.get("pins") === "1");
  const [pins, setPins] = useState<PinItem[] | null>(null);

  const groups = useMemo(() => groupsOf(list), [list]);
  const shown = useMemo(() => {
    const key = codeKey(q);
    return (list ?? []).filter((s) => {
      if (group !== null && s.group !== group) return false;
      if (noPin && s.hasPin) return false;
      if (!q.trim()) return true;
      return s.name.includes(q.trim()) || (key && (s.codeKey.includes(key) || (s.barcodeKey ?? "").includes(key)));
    });
  }, [list, q, group, noPin]);
  const missing = (list ?? []).filter((s) => s.active && !s.hasPin).length;

  return (
    <>
      <TopBar
        title="الطلاب"
        sub={list ? `${list.filter((s) => s.active).length} طالب نشط · ${groups.length} مجموعة` : undefined}
        actions={
          <>
            <IconButton icon="key" label="رموز الدخول" onClick={() => setPinsOpen(true)} />
            <IconButton icon="list" label="إضافة مجموعة طلاب" onClick={() => setBulk(true)} />
            <Button size="sm" variant="primary" icon="plus" onClick={() => setEditing("new")}>
              طالب
            </Button>
          </>
        }
      />
      {missing > 0 && (
        <Card className="mb-4 flex items-center gap-3 border-warn/30 bg-warn/[0.06]">
          <Icon name="key" size={20} className="shrink-0 text-warn" />
          <p className="flex-1 text-sm text-mist">{missing} طالب بدون رمز دخول للتطبيق.</p>
          <Button size="sm" onClick={() => setPinsOpen(true)}>
            إنشاء الرموز
          </Button>
        </Card>
      )}
      <div className="grid gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="ابحث بالاسم أو رقم الكارنيه" />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <Chip active={group === null} onClick={() => setGroup(null)} count={list?.length}>
            الكل
          </Chip>
          {groups.map((g) => (
            <Chip key={g} active={group === g} onClick={() => setGroup(g)} count={list?.filter((s) => s.group === g).length}>
              {g}
            </Chip>
          ))}
          {list?.some((s) => !s.group) && (
            <Chip active={group === ""} onClick={() => setGroup("")}>
              بدون مجموعة
            </Chip>
          )}
          <Chip active={noPin} onClick={() => setNoPin(!noPin)}>
            بدون رمز
          </Chip>
        </div>
      </div>
      <div className="mt-4">
        {loading && !list ? (
          <Loading />
        ) : error && !list ? (
          <ErrorBox error={error} retry={reload} />
        ) : !list?.length ? (
          <Empty
            icon="users"
            title="لا يوجد طلاب بعد"
            body="أضف رقم الكارنيه لكل طالب (واحد واحد أو مجموعة مرة واحدة)، وبعدها سجّل الحضور بمسح باركود الكارنيه."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" icon="plus" onClick={() => setEditing("new")}>
                  إضافة طالب
                </Button>
                <Button icon="list" onClick={() => setBulk(true)}>
                  إضافة مجموعة
                </Button>
              </div>
            }
          />
        ) : !shown.length ? (
          <Empty icon="search" title="لا نتائج" />
        ) : (
          <List>
            {shown.map((s) => (
              <Row key={s.id} onClick={() => setEditing(s)}>
                <div className="flex items-center gap-3">
                  <Avatar name={s.name} />
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-[15px] font-semibold", s.active ? "text-chalk" : "text-fog line-through")}>{s.name}</p>
                    <p className="truncate text-xs text-fog">
                      <span dir="ltr" className="font-mono">
                        {s.code}
                      </span>
                      {s.group ? ` · ${s.group}` : ""}
                    </p>
                  </div>
                  {!s.active ? <Badge>موقوف</Badge> : s.locked ? <Badge tone="danger">مقفول</Badge> : !s.hasPin ? <Badge tone="warn">بدون رمز</Badge> : null}
                </div>
              </Row>
            ))}
          </List>
        )}
      </div>

      <StudentSheet student={editing} me={me} groups={groups} onClose={() => setEditing(null)} onPins={setPins} />
      <BulkSheet open={bulk} onClose={() => setBulk(false)} groups={groups} existing={list ?? []} onPins={setPins} />
      <PinsSheet open={pinsOpen} onClose={() => setPinsOpen(false)} groups={groups} students={list ?? []} onPins={setPins} />
      <PinResults items={pins} onClose={() => setPins(null)} />
    </>
  );
}

/* ─── Add / edit one student ───────────────────────────────────────────── */

function StudentSheet({ student, me, groups, onClose, onPins }: { student: Student | "new" | null; me: StaffRow; groups: string[]; onClose: () => void; onPins: (p: PinItem[]) => void }) {
  const isNew = student === "new";
  const s = student && student !== "new" ? student : null;
  const [form, setForm] = useState({ code: "", name: "", group: "", phone: "", notes: "", barcode: "", active: true, withPin: true });
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState<null | "code" | "barcode">(null);

  useEffect(() => {
    if (!student) return;
    setScanning(null);
    setForm(
      s
        ? { code: s.code, name: s.name, group: s.group, phone: s.phone ?? "", notes: s.notes ?? "", barcode: s.barcode ?? "", active: s.active, withPin: false }
        : { code: "", name: "", group: groups.length === 1 ? groups[0]! : "", phone: "", notes: "", barcode: "", active: true, withPin: true },
    );
  }, [student]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!codeKey(form.code)) return toast("رقم الطالب يجب أن يحتوي على حروف أو أرقام.", "error");
    setBusy(true);
    try {
      const row = { code: form.code.trim(), full_name: form.name.trim(), group_name: form.group, phone: form.phone.trim() || null, notes: form.notes.trim() || null, barcode: form.barcode.trim() || null, active: form.active };
      if (s) {
        must(await sb().from("students").update(row).eq("id", s.id).select());
        toast("تم الحفظ");
      } else {
        const created = must(await sb().from("students").insert(row).select("id").single()) as { id: string };
        toast("تمت إضافة الطالب");
        if (form.withPin) onPins(await rpc<PinItem[]>("staff_set_pins", { p_ids: [created.id], p_only_missing: false }));
      }
      await refreshStudents();
      onClose();
    } catch (e2) {
      toast.error(e2);
    } finally {
      setBusy(false);
    }
  };

  const newPin = async () => {
    if (!s) return;
    if (s.hasPin && !(await confirmDialog({ title: "رمز دخول جديد؟", body: "الرمز القديم سيتوقف، وسيخرج الطالب من التطبيق على كل الأجهزة.", ok: "إنشاء رمز جديد" }))) return;
    try {
      onPins(await rpc<PinItem[]>("staff_set_pins", { p_ids: [s.id], p_only_missing: false }));
      refreshStudents().catch(() => undefined);
    } catch (e) {
      toast.error(e);
    }
  };

  const remove = async () => {
    if (!s) return;
    if (!(await confirmDialog({ title: `حذف ${s.name}؟`, body: "سيُحذف سجل حضوره ونتائج الكويزات نهائيًا. لو الطالب ترك فقط، الأفضل إيقافه بدل الحذف.", ok: "حذف نهائي", danger: true }))) return;
    try {
      const gone = must(await sb().from("students").delete().eq("id", s.id).select("id")) as { id: string }[];
      if (!gone.length) throw new Error("forbidden");
      patchStudents((list) => list.filter((x) => x.id !== s.id));
      toast("تم الحذف");
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };

  const set = (k: "code" | "name" | "phone" | "notes" | "barcode") => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Sheet open={!!student} onClose={onClose} title={isNew ? "إضافة طالب" : (s?.name ?? "")}>
      <form onSubmit={save} className="grid gap-4">
        <Field label="رقم الطالب (رقم الكارنيه)">
          <div className="flex gap-2">
            <Input value={form.code} onChange={set("code")} dir="ltr" className="font-mono" required maxLength={40} autoComplete="off" />
            <IconButton icon="camera" label="مسح من الكارنيه" onClick={() => setScanning(scanning === "code" ? null : "code")} className="size-12 border border-[var(--line-2)]" />
          </div>
        </Field>
        {scanning && (
          <Scanner
            autoStart
            onDetect={(raw) => {
              setForm((f) => ({ ...f, [scanning]: raw }));
              setScanning(null);
              toast("تمت قراءة الباركود", "info");
            }}
          />
        )}
        <Field label="الاسم">
          <Input value={form.name} onChange={set("name")} required maxLength={120} autoComplete="off" />
        </Field>
        <Field label="المجموعة">
          <GroupSelect value={form.group} onChange={(group) => setForm((f) => ({ ...f, group }))} groups={groups} allLabel="بدون مجموعة" allowNew />
        </Field>
        <Field label="موبايل (اختياري)" hint="خاص بفريق التدريب فقط.">
          <Input value={form.phone} onChange={set("phone")} type="tel" inputMode="tel" dir="ltr" maxLength={30} />
        </Field>
        {!isNew && (
          <Field label="باركود الكارنيه المرتبط (اختياري)" hint="لو باركود الكارنيه مختلف عن رقم الطالب.">
            <div className="flex gap-2">
              <Input value={form.barcode} onChange={set("barcode")} dir="ltr" className="font-mono" maxLength={80} />
              <IconButton icon="camera" label="مسح الباركود" onClick={() => setScanning(scanning === "barcode" ? null : "barcode")} className="size-12 border border-[var(--line-2)]" />
            </div>
          </Field>
        )}
        <Field label="ملاحظات (اختياري)">
          <Textarea value={form.notes} onChange={set("notes")} rows={2} maxLength={2000} />
        </Field>
        {isNew ? (
          <Toggle checked={form.withPin} onChange={(withPin) => setForm((f) => ({ ...f, withPin }))} label="إنشاء رمز دخول للتطبيق الآن" />
        ) : (
          <Toggle checked={form.active} onChange={(active) => setForm((f) => ({ ...f, active }))} label="طالب نشط" hint="الطالب الموقوف لا يُسجَّل حضوره ولا يدخل التطبيق." />
        )}
        <Button type="submit" variant="primary" size="lg" loading={busy} icon="check" block>
          {isNew ? "إضافة" : "حفظ"}
        </Button>
        {s && (
          <div className="grid gap-2 border-t border-[var(--line)] pt-4">
            <p className="text-xs text-fog">
              {s.hasPin ? (s.lastLogin ? `آخر دخول للتطبيق ${fmt.rel(s.lastLogin)}` : "لديه رمز دخول، لم يدخل بعد.") : "لا يوجد رمز دخول بعد."}
              {s.locked ? " · الدخول مقفول مؤقتًا بسبب محاولات خاطئة." : ""}
            </p>
            <Button icon="key" onClick={newPin} block>
              {s.hasPin ? "رمز دخول جديد" : "إنشاء رمز دخول"}
            </Button>
            {(me.role === "owner" || me.role === "admin") && (
              <Button variant="danger" icon="trash" onClick={remove} block>
                حذف الطالب
              </Button>
            )}
          </div>
        )}
      </form>
    </Sheet>
  );
}

/* ─── Many students at once ────────────────────────────────────────────── */

type Parsed = { code: string; name: string; group: string; note?: string };

function parseBulk(text: string, defaultGroup: string, existing: Set<string>) {
  const rows: Parsed[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let cells = line.includes("\t") ? line.split("\t") : /[,،;]/.test(line) ? line.split(/[,،;]/) : (line.match(/^(\S+)\s+(.+)$/)?.slice(1) ?? [line]);
    cells = cells.map((c) => c.trim()).filter(Boolean);
    // Accept "name, code" as well as "code, name": the code is the cell with the most digits.
    const digits = (c: string) => codeKey(c).replace(/\D/g, "").length;
    if (cells.length >= 2 && digits(cells[1]!) > digits(cells[0]!)) [cells[0], cells[1]] = [cells[1]!, cells[0]!];
    if (cells.length === 1) {
      const m = line.match(/^(.+?)\s+(\S*\d\S*)$/);
      if (m) cells = [m[2]!, m[1]!];
    }
    const [code = "", name = "", group = defaultGroup] = cells;
    const key = codeKey(code);
    let note: string | undefined;
    if (!key) note = "رقم غير صالح";
    else if (!name) note = "بدون اسم";
    else if (seen.has(key)) note = "مكرر في القائمة";
    else if (existing.has(key)) note = "مسجّل بالفعل";
    if (key) seen.add(key);
    rows.push({ code, name, group: group || defaultGroup, note });
  }
  return rows;
}

function BulkSheet({ open, onClose, groups, existing, onPins }: { open: boolean; onClose: () => void; groups: string[]; existing: Student[]; onPins: (p: PinItem[]) => void }) {
  const [text, setText] = useState("");
  const [group, setGroup] = useState("");
  const [withPins, setWithPins] = useState(true);
  const [busy, setBusy] = useState(false);
  const keys = useMemo(() => new Set(existing.flatMap((s) => [s.codeKey, s.barcodeKey ?? ""]).filter(Boolean)), [existing]);
  const rows = useMemo(() => parseBulk(text, group, keys), [text, group, keys]);
  const good = rows.filter((r) => !r.note);

  const save = async () => {
    setBusy(true);
    try {
      const ids: string[] = [];
      for (let i = 0; i < good.length; i += 400) {
        const chunk = good.slice(i, i + 400).map((r) => ({ code: r.code, full_name: r.name, group_name: r.group }));
        const created = must(await sb().from("students").upsert(chunk, { onConflict: "code_key", ignoreDuplicates: true }).select("id")) as { id: string }[];
        ids.push(...created.map((c) => c.id));
      }
      toast(`تمت إضافة ${ids.length} طالب`);
      if (withPins && ids.length) onPins(await rpc<PinItem[]>("staff_set_pins", { p_ids: ids, p_only_missing: true }));
      await refreshStudents();
      setText("");
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="إضافة مجموعة طلاب" wide>
      <div className="grid gap-4">
        <Field label="الطلاب (سطر لكل طالب)" hint="رقم الطالب ثم الاسم، مفصولين بفاصلة أو مسافة أو Tab. ينفع تنسخ عمودين من Excel مباشرة. عمود ثالث اختياري للمجموعة.">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} dir="auto" placeholder={"20210345, أحمد علي\n20210346, منى سامي"} className="font-mono text-sm" />
        </Field>
        <Field label="المجموعة">
          <GroupSelect value={group} onChange={setGroup} groups={groups} allLabel="بدون مجموعة" allowNew />
        </Field>
        <Toggle checked={withPins} onChange={setWithPins} label="إنشاء رموز دخول للطلاب الجدد" />
        {rows.length > 0 && (
          <div className="max-h-64 overflow-y-auto rounded-xl border border-[var(--line)]">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-[var(--line)]">
                {rows.map((r, i) => (
                  <tr key={i} className={r.note ? "text-fog" : "text-chalk"}>
                    <td className="px-3 py-2 font-mono" dir="ltr">
                      {r.code}
                    </td>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2 text-xs text-fog">{r.group}</td>
                    <td className="px-3 py-2 text-end">{r.note ? <Badge tone={r.note === "مسجّل بالفعل" ? "muted" : "danger"}>{r.note}</Badge> : <Icon name="check" size={16} className="text-ok" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Button variant="primary" size="lg" icon="plus" loading={busy} disabled={!good.length} onClick={save} block>
          {good.length ? `إضافة ${good.length} طالب` : "إضافة"}
        </Button>
      </div>
    </Sheet>
  );
}

/* ─── PIN codes ────────────────────────────────────────────────────────── */

function PinsSheet({ open, onClose, groups, students, onPins }: { open: boolean; onClose: () => void; groups: string[]; students: Student[]; onPins: (p: PinItem[]) => void }) {
  const [group, setGroup] = useState("");
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const scope = students.filter((s) => s.active && (!group || s.group === group));
  const target = all ? scope : scope.filter((s) => !s.hasPin);

  const run = async () => {
    if (all && !(await confirmDialog({ title: "إعادة إنشاء كل الرموز؟", body: "الرموز القديمة لهذه الطلاب ستتوقف، وسيخرجون من التطبيق.", ok: "إعادة الإنشاء", danger: true }))) return;
    setBusy(true);
    try {
      onPins(await rpc<PinItem[]>("staff_set_pins", { p_ids: target.map((s) => s.id), p_only_missing: !all }));
      refreshStudents().catch(() => undefined);
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="رموز الدخول للطلاب">
      <div className="grid gap-4">
        <p className="text-sm leading-relaxed text-mist">كل طالب يدخل التطبيق برقمه + رمز من 6 أرقام. الرمز يظهر مرة واحدة فقط بعد الإنشاء، فاطبعه أو انسخه وسلّمه للطالب.</p>
        <Field label="المجموعة">
          <GroupSelect value={group} onChange={setGroup} groups={groups} />
        </Field>
        <Toggle checked={all} onChange={setAll} label="إعادة إنشاء رموز للكل" hint="بدلًا من الطلاب اللي ملهمش رمز فقط." />
        <Button variant="primary" size="lg" icon="key" loading={busy} disabled={!target.length} onClick={run} block>
          {target.length ? `إنشاء ${target.length} رمز` : "كل الطلاب لديهم رموز"}
        </Button>
      </div>
    </Sheet>
  );
}

function PinResults({ items, onClose }: { items: PinItem[] | null; onClose: () => void }) {
  const [printing, setPrinting] = useState(false);
  if (!items) return null;
  const text = items.map((p) => `${p.name} — ${p.code} — رمز الدخول: ${p.pin}`).join("\n");
  const one = items.length === 1 ? items[0]! : null;
  const msg = one ? `أهلاً ${one.name}\nبيانات دخولك على تطبيق BuildX HUE:\nرقم الطالب: ${one.code}\nرمز الدخول: ${one.pin}\n${loginUrl(one.code)}` : "";
  return (
    <>
      <Sheet open onClose={onClose} title={items.length === 1 ? "رمز الدخول" : `${items.length} رمز دخول`} wide>
        <div className="grid gap-4">
          <p className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/[0.07] px-3 py-2.5 text-sm text-[#ffd08a]">
            <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
            احفظ الرموز دلوقتي: لن تظهر مرة أخرى (يمكن إنشاء رمز جديد في أي وقت).
          </p>
          {one ? (
            <Card className="text-center">
              <p className="text-lg font-bold text-chalk">{one.name}</p>
              <p className="font-mono text-sm text-fog" dir="ltr">
                {one.code}
              </p>
              <p className="mt-3 font-mono text-4xl font-bold tracking-[0.3em] text-cyan" dir="ltr">
                {one.pin}
              </p>
            </Card>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-xl border border-[var(--line)]">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-[var(--line)]">
                  {items.map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2 text-chalk">{p.name}</td>
                      <td className="px-3 py-2 font-mono text-fog" dir="ltr">
                        {p.code}
                      </td>
                      <td className="px-3 py-2 text-end font-mono text-base font-bold tracking-widest text-cyan" dir="ltr">
                        {p.pin}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button icon="printer" onClick={() => setPrinting(true)}>
              طباعة كروت
            </Button>
            <Button icon="copy" onClick={() => copyText(one ? msg : text)}>
              نسخ
            </Button>
            {one ? (
              <a
                href={whatsappLink(null, msg) ?? `https://wa.me/?text=${encodeURIComponent(msg)}`}
                target="_blank"
                rel="noreferrer"
                className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1fae5b] font-semibold text-white"
              >
                <Icon name="share" size={18} />
                إرسال على واتساب
              </a>
            ) : (
              <Button
                icon="download"
                className="col-span-2"
                onClick={() => downloadCsv(`robohub-pins-${new Date().toISOString().slice(0, 10)}.csv`, [["الاسم", "رقم الطالب", "المجموعة", "رمز الدخول"], ...items.map((p) => [p.name, p.code, p.group, p.pin])])}
              >
                تنزيل Excel/CSV
              </Button>
            )}
          </div>
        </div>
      </Sheet>
      {printing && <PrintCards items={items} onDone={() => setPrinting(false)} />}
    </>
  );
}

/** Printable login slips: name, code, PIN and a real QR code that opens the student login. */
function PrintCards({ items, onDone }: { items: PinItem[]; onDone: () => void }) {
  const [qr, setQr] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const QRCode = (await import("qrcode")).default;
      const out: Record<string, string> = {};
      for (const it of items) out[it.id] = await QRCode.toDataURL(loginUrl(it.code), { margin: 1, width: 240, errorCorrectionLevel: "M" });
      if (alive) setQr(out);
    })();
    return () => {
      alive = false;
    };
  }, [items]);
  useEffect(() => {
    if (!qr) return;
    const after = () => onDone();
    window.addEventListener("afterprint", after);
    const t = setTimeout(() => window.print(), 250);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", after);
    };
  }, [qr, onDone]);
  const host = `${window.location.host}${APP_PATH}`;
  return createPortal(
    <div id="rh-print" dir="rtl">
      <style>{`#rh-print{display:none}@media print{body>*:not(#rh-print){display:none!important}#rh-print{display:block!important;color:#000;background:#fff}@page{margin:9mm}}`}</style>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6mm" }}>
        {items.map((p) => (
          <div key={p.id} style={{ border: "1px solid #999", borderRadius: "4mm", padding: "4mm", display: "flex", gap: "4mm", alignItems: "center", breakInside: "avoid", fontFamily: "system-ui, Tahoma, sans-serif" }}>
            {qr?.[p.id] && <img src={qr[p.id]} alt="" style={{ width: "30mm", height: "30mm" }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "8pt", color: "#555" }}>BuildX HUE · تطبيق BuildX HUE</div>
              <div style={{ fontSize: "12pt", fontWeight: 700, marginTop: "1mm" }}>{p.name}</div>
              <div style={{ fontSize: "9pt", direction: "ltr", textAlign: "right" }}>رقم الطالب: {p.code}</div>
              <div style={{ fontSize: "16pt", fontWeight: 800, letterSpacing: "2pt", direction: "ltr", textAlign: "right", marginTop: "1mm" }}>PIN {p.pin}</div>
              <div style={{ fontSize: "7pt", color: "#555", marginTop: "1mm", direction: "ltr", textAlign: "right" }}>{host}</div>
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
