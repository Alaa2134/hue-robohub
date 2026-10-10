"use client";
/**
 * WhatsApp (Meta's WhatsApp Cloud API): the owner connects the number here, and whoever has the
 * "whatsapp" area sends to typed numbers, an expo delegation or a group of students. The access token
 * is typed once and goes straight to the database's encrypted Vault; no screen ever reads it back.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { canSee, errorText, fmt, isFull, must, rpc, sb, type StaffRow } from "./core";
import { groupsOf, useStudents } from "./staff-data";
import { takeHandoff, type Handoff } from "./wa-handoff";
import { Badge, Button, Card, Chip, Empty, ErrorBox, Field, Icon, Input, List, Loading, Row, Section, Select, Stat, Textarea, TopBar, confirmDialog, toast, useAsync } from "./ui";

type Template = { name: string; language: string; category?: string; body?: string | null };
type Status = {
  connected: boolean;
  status: "none" | "checking" | "ok" | "failed" | "off";
  phone_number_id: string | null;
  business_id: string | null;
  display_phone: string | null;
  verified_name: string | null;
  quality: string | null;
  error: string | null;
  checked_at: string | null;
  templates: Template[];
  has_token: boolean;
  sent_today: number;
  failed_today: number;
  can_send: boolean;
  can_connect: boolean;
};
type Message = { id: number; to_phone: string; to_name: string | null; kind: "text" | "template"; body: string | null; template: string | null; status: "queued" | "sent" | "failed"; error: string | null; created_at: string; context: string | null; via?: "api" | "web" };
type Person = { phone: string; name: string };

const WA_ERRORS: Record<string, string> = {
  whatsapp_not_connected: "واتساب مش مربوط أو الربط فيه مشكلة. اربطه الأول.",
  invalid_token: "الـ Access token شكله مش صح. انسخه تاني كامل من صفحة ميتا.",
  invalid_ids: "الـ Phone number ID والـ Business account ID أرقام بس.",
  token_required: "اكتب الـ Access token.",
  too_many: "أقصى حاجة 300 رقم في المرة.",
  daily_limit: "وصلت للحد اليومي (1000 رسالة في اليوم). كمّل بكرة.",
  invalid_message: "اكتب الرسالة أو اختار قالب، واختار الناس.",
};
const waError = (e: unknown) => WA_ERRORS[(e as { message?: string })?.message ?? ""] ?? errorText(e);

/** "Ahmed, 01012345678" / "01012345678" lines → people. */
function parsePeople(text: string): Person[] {
  return text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const phone = (l.match(/\+?[\d\s-]{8,}/)?.[0] ?? "").replace(/[^\d+]/g, "");
      const name = l.replace(/\+?[\d\s-]{8,}/, "").replace(/[,،:\-–]+/g, " ").trim();
      return { phone, name };
    })
    .filter((p) => p.phone.length >= 8);
}

export function WhatsAppScreen({ me }: { me: StaffRow }) {
  const { data: st, error, loading, reload: load } = useAsync(() => rpc<Status>("staff_whatsapp_status"), []);
  // WhatsApp Web unless the team connected the official API.
  const [chosen, setWay] = useState<"web" | "api" | null>(null);
  const way = (x: Status) => chosen ?? (x.connected ? "api" : "web");
  const [logKey, setLogKey] = useState(0);
  // People sent here from another screen ("ابعت واتساب"), read once.
  const [handoff] = useState(takeHandoff);
  const reload = () => (setLogKey((k) => k + 1), load());
  // While Meta is being asked, look again every few seconds.
  useEffect(() => {
    if (st?.status !== "checking") return;
    const t = setTimeout(reload, 3000);
    return () => clearTimeout(t);
  }, [st]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <TopBar title="واتساب" sub="ربط رقم الفريق وإرسال الرسايل من التطبيق" back="/staff/more" />
      {loading && !st ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : st ? (
        <div className="grid gap-4">
          <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-white/[0.03] p-1 text-sm">
            {(["web", "api"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={way(st) === m} onClick={() => setWay(m)} className={way(st) === m ? "rounded-lg bg-[#1fa855]/25 px-3 py-2 text-chalk" : "rounded-lg px-3 py-2 text-fog"}>
                {m === "web" ? "واتساب ويب (من غير ربط)" : "ربط رسمي (API)"}
              </button>
            ))}
          </div>
          {way(st) === "web" ? (
            st.can_send ? <WebSender me={me} handoff={handoff} onSent={reload} /> : <Empty icon="chat" title="الإرسال محتاج صلاحية واتساب كاملة" body="تقدر تشوف السجل بس." />
          ) : (
            <>
              <StatusCard st={st} />
              {st.can_connect && <ConnectCard st={st} onDone={reload} />}
              {st.connected && st.can_send && <SendCard st={st} me={me} handoff={handoff} onSent={reload} />}
              {!st.connected && !st.can_connect && <Empty icon="chat" title="واتساب لسه مش مربوط" body="المالك بيربط رقم الفريق من هنا، وبعدها تقدر تبعت." />}
            </>
          )}
          <MessageLog key={`${st.sent_today}-${st.failed_today}-${logKey}`} />
        </div>
      ) : null}
    </>
  );
}

function StatusCard({ st }: { st: Status }) {
  const tone = st.status === "ok" ? "ok" : st.status === "checking" ? "info" : st.status === "failed" ? "danger" : "muted";
  const label = { ok: "مربوط", checking: "بنتأكد من ميتا…", failed: "الربط فيه مشكلة", off: "مفصول", none: "مش مربوط" }[st.status];
  return (
    <Card className="grid gap-3" data-testid="wa-status">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-full bg-[#25d366]/15 text-[#25d366]">
          <Icon name="chat" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-chalk">{st.verified_name || "رقم الفريق"}</p>
          <p className="font-mono text-xs text-fog" dir="ltr">
            {st.display_phone || (st.phone_number_id ? `ID ${st.phone_number_id}` : "—")}
          </p>
        </div>
        <Badge tone={tone}>{label}</Badge>
      </div>
      {st.status === "failed" && st.error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger" dir="auto">{st.error}</p>}
      {st.connected && (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="اتبعت النهارده" value={st.sent_today} tone="ok" />
          <Stat label="فشل النهارده" value={st.failed_today} tone={st.failed_today ? "danger" : undefined} />
        </div>
      )}
    </Card>
  );
}

function ConnectCard({ st, onDone }: { st: Status; onDone: () => void }) {
  const [open, setOpen] = useState(!st.has_token);
  const [f, setF] = useState({ phone: st.phone_number_id ?? "", biz: st.business_id ?? "", token: "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await rpc("staff_whatsapp_connect", { p_phone_number_id: f.phone.trim(), p_token: f.token.trim(), p_business_id: f.biz.trim() || null });
      setF((x) => ({ ...x, token: "" }));
      toast("اتحفظ. بنتأكد من الرقم مع ميتا…");
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error(waError(e));
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async () => {
    if (!(await confirmDialog({ title: "فصل واتساب؟", body: "مش هيتبعت أي رسالة لحد ما تربطه تاني. السجل بيفضل زي ما هو.", ok: "افصل", danger: true }))) return;
    try {
      await rpc("staff_whatsapp_disconnect");
      toast("اتفصل");
      onDone();
    } catch (e) {
      toast.error(waError(e));
    }
  };
  if (!open)
    return (
      <div className="flex flex-wrap gap-2">
        <Button icon="settings" onClick={() => setOpen(true)}>
          تغيير الربط
        </Button>
        {st.has_token && (
          <Button variant="danger" onClick={disconnect}>
            افصل
          </Button>
        )}
      </div>
    );
  return (
    <Card className="grid gap-3" data-testid="wa-connect">
      <p className="text-sm font-semibold text-chalk">{st.has_token ? "تغيير الربط" : "اربط رقم واتساب الفريق"}</p>
      <ol className="grid list-decimal gap-1 ps-5 text-xs leading-relaxed text-fog">
        <li>
          ادخل <span dir="ltr">developers.facebook.com</span> ← تطبيقك ← <b className="text-mist">WhatsApp ← API Setup</b>.
        </li>
        <li>
          انسخ <b className="text-mist">Phone number ID</b> و<b className="text-mist">WhatsApp Business Account ID</b>.
        </li>
        <li>
          اعمل <b className="text-mist">System User</b> في إعدادات البيزنس واديله صلاحية <span dir="ltr">whatsapp_business_messaging</span>، واعمله توكن دائم وانسخه هنا.
        </li>
      </ol>
      <Field label="Phone number ID">
        <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, "") })} inputMode="numeric" dir="ltr" required />
      </Field>
      <Field label="WhatsApp Business Account ID" hint="عشان نجيب القوالب المتوافق عليها. ممكن تسيبه فاضي.">
        <Input value={f.biz} onChange={(e) => setF({ ...f, biz: e.target.value.replace(/\D/g, "") })} inputMode="numeric" dir="ltr" />
      </Field>
      <Field label="Access token" hint={st.has_token ? "سيبه فاضي لو مش عايز تغيّره. التوكن بيتحفظ متشفّر ومحدش يقدر يشوفه تاني ولا حتى إنت." : "بيتحفظ متشفّر في قاعدة البيانات، ومحدش يقدر يشوفه تاني ولا حتى إنت."}>
        <Input type="password" autoComplete="off" value={f.token} onChange={(e) => setF({ ...f, token: e.target.value })} dir="ltr" placeholder={st.has_token ? "••••••••" : "EAA…"} />
      </Field>
      <div className="flex gap-2">
        <Button variant="primary" icon="link" loading={busy} disabled={!f.phone || (!st.has_token && !f.token)} onClick={save}>
          {st.has_token ? "احفظ" : "اربط"}
        </Button>
        {st.has_token && <Button onClick={() => setOpen(false)}>إلغاء</Button>}
      </div>
    </Card>
  );
}

type Source = "typed" | "delegation" | "group" | "handoff";

/** Who to send to: typed numbers, an expo delegation (the accepted) or students (a group or all). */
function useRecipients(me: StaffRow, handoff: Handoff | null) {
  const delegations = canSee(me, "expo") || canSee(me, "forms");
  const students = canSee(me, "training");
  const [source, setSource] = useState<Source>(handoff ? "handoff" : "typed");
  const [typed, setTyped] = useState("");
  const [formId, setFormId] = useState("");
  const [group, setGroup] = useState("");
  const forms = useAsync(
    async () => (delegations ? ((await sb().from("forms").select("id, title_ar").not("delegation", "is", null).order("created_at", { ascending: false }).then(must)) as { id: string; title_ar: string }[]) : []),
    [delegations],
  );
  const delegates = useAsync(
    async () =>
      formId ? ((await sb().from("form_responses").select("name, phone").eq("form_id", formId).eq("status", "accepted").then(must)) as { name: string | null; phone: string | null }[]) : [],
    [formId],
  );
  const roster = useStudents();
  const people: Person[] = useMemo(() => {
    if (source === "handoff") return handoff?.people ?? [];
    if (source === "typed") return parsePeople(typed);
    if (source === "delegation") return (delegates.data ?? []).filter((d) => d.phone).map((d) => ({ phone: d.phone!, name: d.name ?? "" }));
    return (roster.list ?? []).filter((s) => s.active && s.phone && (!group || s.group === group)).map((s) => ({ phone: s.phone!, name: s.name }));
  }, [source, typed, delegates.data, roster.list, group, handoff]);
  const context = source === "handoff" ? (handoff?.context ?? null) : source === "delegation" ? `expo:${formId}` : source === "group" ? `group:${group || "all"}` : null;
  const ui = (
    <>
      <Field label="لمين؟">
        <Select value={source} onChange={(e) => setSource(e.target.value as Source)}>
          {handoff && <option value="handoff">{handoff.label}</option>}
          <option value="typed">أرقام أكتبها</option>
          {delegations && <option value="delegation">وفد معرض (المقبولين)</option>}
          {students && <option value="group">طلاب (مجموعة أو الكل)</option>}
        </Select>
      </Field>
      {source === "typed" && (
        <Field label="الأرقام" hint="كل سطر: الاسم ورقم الموبايل، أو الرقم بس. أرقام مصر 01… بتتظبط لوحدها.">
          <Textarea rows={4} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={"أحمد، 01012345678\n01198765432"} />
        </Field>
      )}
      {source === "delegation" && (
        <Field label="الوفد">
          <Select value={formId} onChange={(e) => setFormId(e.target.value)}>
            <option value="">اختار…</option>
            {(forms.data ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.title_ar}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {source === "group" && (
        <Field label="المجموعة">
          <Select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">كل الطلاب</option>
            {groupsOf(roster.list ?? []).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <p className="text-xs text-fog">{people.length ? `${people.length} شخص` : "مفيش أرقام لسه"}</p>
    </>
  );
  return { people, context, ui };
}

function SendCard({ st, me, handoff, onSent }: { st: Status; me: StaffRow; handoff: Handoff | null; onSent: () => void }) {
  const { people, context, ui } = useRecipients(me, handoff);
  const [mode, setMode] = useState<"template" | "text">(st.templates.length ? "template" : "text");
  const [tpl, setTpl] = useState(st.templates[0] ? `${st.templates[0].name}|${st.templates[0].language}` : "");
  const [params, setParams] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const template = st.templates.find((t) => `${t.name}|${t.language}` === tpl);
  const slots = template?.body ? Math.max(0, ...[...template.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]))) : 0;
  useEffect(() => setParams((p) => Array.from({ length: slots }, (_, i) => p[i] ?? (i === 0 ? "{name}" : ""))), [slots]);

  const send = async () => {
    if (!(await confirmDialog({ title: `إرسال لـ ${people.length} ${people.length === 1 ? "شخص" : "أشخاص"}؟`, body: "الرسايل بتتبعت فورًا من رقم الفريق.", ok: "ابعت" }))) return;
    setBusy(true);
    try {
      const r = await rpc<{ queued: number; skipped: number }>("staff_whatsapp_send", {
        p_people: people,
        p_text: mode === "text" ? text : null,
        p_template: mode === "template" ? template?.name ?? null : null,
        p_lang: mode === "template" ? template?.language ?? "ar" : "ar",
        p_params: mode === "template" ? params : [],
        p_context: context,
      });
      toast(`اتبعت لـ ${r.queued}${r.skipped ? ` · ${r.skipped} رقم مش صح أو متكرر` : ""}`);
      onSent();
    } catch (e) {
      toast.error(waError(e));
    } finally {
      setBusy(false);
    }
  };

  const ready = people.length > 0 && people.length <= 300 && (mode === "text" ? text.trim().length > 0 : !!template && params.every((p) => p.trim()));
  return (
    <Card className="grid gap-3" data-testid="wa-send">
      <p className="text-sm font-semibold text-chalk">إرسال رسالة</p>
      {ui}
      {people.length > 300 && <p className="text-xs text-warn">أقصى حاجة 300 في المرة</p>}
      <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-lg bg-white/[0.03] p-1 text-xs">
        {(["template", "text"] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={mode === m ? "rounded-md bg-cyan/25 px-2 py-1.5 text-chalk" : "rounded-md px-2 py-1.5 text-fog"}>
            {m === "template" ? "قالب متوافق عليه" : "رسالة حرة"}
          </button>
        ))}
      </div>
      {mode === "template" ? (
        st.templates.length ? (
          <>
            <Field label="القالب">
              <Select value={tpl} onChange={(e) => setTpl(e.target.value)}>
                {st.templates.map((t) => (
                  <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                    {t.name} ({t.language})
                  </option>
                ))}
              </Select>
            </Field>
            {template?.body && <p className="whitespace-pre-wrap rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-mist" dir="auto">{template.body}</p>}
            {params.map((p, i) => (
              <Field key={i} label={`{{${i + 1}}}`} hint={i === 0 ? "{name} = اسم كل واحد" : undefined}>
                <Input value={p} onChange={(e) => setParams((x) => x.map((v, j) => (j === i ? e.target.value : v)))} />
              </Field>
            ))}
          </>
        ) : (
          <p className="text-xs text-fog">مفيش قوالب متوافق عليها. اعمل قالب من WhatsApp Manager وبعد ما يتوافق عليه اضغط «تغيير الربط» واحفظ عشان يتحمّل، أو ابعت رسالة حرة.</p>
        )
      ) : (
        <>
        <Snippets text={text} onPick={setText} />
        <Field label="الرسالة" hint="بتوصل بس للي بعتلك رسالة على الرقم ده في آخر 24 ساعة (قاعدة ميتا). لغيرهم استخدم قالب. {name} = اسم كل واحد.">
          <Textarea rows={4} maxLength={4096} value={text} onChange={(e) => setText(e.target.value)} placeholder="أهلًا {name}، …" />
        </Field>
        </>
      )}
      <Button variant="primary" icon="chat" loading={busy} disabled={!ready} onClick={send}>
        ابعت
      </Button>
      {isFull(me) && <p className="text-[11px] text-fog">أقصى حاجة 300 رقم في المرة و1000 رسالة في اليوم، عشان الرقم مايتحظرش من ميتا.</p>}
    </Card>
  );
}

type Snippet = { id: string; title: string; body: string };

/** Saved messages: tap one to use it; save the one you wrote; retire ones nobody uses. */
function Snippets({ text, onPick }: { text: string; onPick: (t: string) => void }) {
  const { data, set } = useAsync(async () => (await sb().from("whatsapp_snippets").select("id, title, body").eq("archived", false).order("created_at").then(must)) as Snippet[], []);
  const [editing, setEditing] = useState(false);
  const save = async () => {
    const title = window.prompt("اسم الرسالة (مثلًا: تذكير بالمحاضرة)")?.trim();
    if (!title) return;
    try {
      const row = (await sb().from("whatsapp_snippets").insert({ title: title.slice(0, 60), body: text }).select("id, title, body").single().then(must)) as Snippet;
      set([...(data ?? []), row]);
      toast("اتحفظت في الرسايل الجاهزة");
    } catch (e) {
      toast.error(e);
    }
  };
  const retire = async (x: Snippet) => {
    if (!(await confirmDialog({ title: `تشيل «${x.title}» من الرسايل الجاهزة؟`, ok: "شيلها", danger: true }))) return;
    try {
      await sb().from("whatsapp_snippets").update({ archived: true }).eq("id", x.id).then(must);
      set((data ?? []).filter((y) => y.id !== x.id));
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <div className="grid gap-1.5" data-testid="wa-snippets">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-mist">رسايل جاهزة</span>
        <span className="flex gap-3">
          {text.replace(/\{(hi|name)\}/g, "").trim().length > 1 && (
            <button type="button" className="text-xs text-cyan" onClick={() => void save()}>
              احفظ اللي مكتوبة
            </button>
          )}
          {!!data?.length && (
            <button type="button" className="text-xs text-fog" onClick={() => setEditing((v) => !v)}>
              {editing ? "خلاص" : "تعديل"}
            </button>
          )}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(data ?? []).map((x) =>
          editing ? (
            <button key={x.id} type="button" onClick={() => void retire(x)} className="rounded-full border border-danger/40 px-3 py-1 text-xs text-danger">
              {x.title} ✕
            </button>
          ) : (
            <Chip key={x.id} active={text === x.body} onClick={() => onPick(x.body)}>
              {x.title}
            </Chip>
          ),
        )}
      </div>
    </div>
  );
}

/* ─── WhatsApp Web: no connection, a safe pace ──────────────────────────── */

const GREETINGS = ["أهلًا", "إزيك", "أهلًا بيك", "مساء الخير", "هاي", "إزيك عامل إيه"];
const PACES = { safe: [12, 25], safer: [25, 50] } as const;
type Item = { phone: string; name: string; state: "wait" | "sent" | "skipped" };
type Run = { items: Item[]; at: number; text: string; context: string | null };
const RUN_KEY = "bx-wa-web";

/** Digits WhatsApp understands (Egyptian 01… → 201…). */
const waDigits = (phone: string) => {
  let d = phone.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (/^01\d{9}$/.test(d)) d = `20${d.slice(1)}`;
  d = d.replace(/\D/g, "");
  return d.length >= 8 && d.length <= 15 ? d : null;
};
/** {name} = first name, {hi} = a different greeting each time (identical messages look like spam). */
const fill = (text: string, name: string) =>
  text.replaceAll("{name}", name.trim().split(/\s+/)[0] || "").replaceAll("{hi}", GREETINGS[Math.floor(Math.random() * GREETINGS.length)]!).replace(/[ \t]{2,}/g, " ");
const cairoHour = () => Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Africa/Cairo" }).format(new Date()));

/**
 * The app opens each person's chat on WhatsApp Web (or the WhatsApp app on a phone) with the message
 * written; you press send there and come back. Between people it waits a random 12–25 seconds (or
 * 25–50), the order is shuffled, the greeting changes, at most 150 a day, and not late at night: the
 * pace of a person, so the number isn't flagged. Stopping keeps your place.
 */
function WebSender({ me, handoff, onSent }: { me: StaffRow; handoff: Handoff | null; onSent: () => void }) {
  const { people, context, ui } = useRecipients(me, handoff);
  const [text, setText] = useState(handoff?.text ?? "{hi} {name} 👋\n");
  const [pace, setPace] = useState<keyof typeof PACES>("safe");
  const [run, setRun] = useState<Run | null>(() => {
    try {
      const r = JSON.parse(localStorage.getItem(RUN_KEY) ?? "null") as Run | null;
      return r && Date.now() - r.at < 864e5 && r.items.some((i) => i.state === "wait") ? r : null;
    } catch {
      return null;
    }
  });
  // The next person opens after this moment (a deadline, so a background tab still counts right).
  const [until, setUntil] = useState(0);
  const [, tick] = useState(0);
  const wait = until ? Math.max(0, Math.ceil((until - Date.now()) / 1000)) : 0;
  const [current, setCurrent] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const win = useRef<Window | null>(null);
  const phone = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  useEffect(() => {
    try {
      if (run) localStorage.setItem(RUN_KEY, JSON.stringify(run));
      else localStorage.removeItem(RUN_KEY);
    } catch {}
  }, [run]);
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => tick((x) => x + 1), 500);
    return () => clearInterval(t);
  }, [until]);

  const next = (r: Run) => r.items.findIndex((i) => i.state === "wait");
  const open = (r: Run, i: number) => {
    const it = r.items[i]!;
    const msg = fill(r.text, it.name);
    const url = phone ? `https://wa.me/${waDigits(it.phone)}?text=${encodeURIComponent(msg)}` : `https://web.whatsapp.com/send?phone=${waDigits(it.phone)}&text=${encodeURIComponent(msg)}`;
    // One WhatsApp Web tab, reused for everyone (on a phone, the WhatsApp app).
    if (!phone && win.current && !win.current.closed) win.current.location.href = url;
    else win.current = window.open(url, phone ? "_blank" : "bx-whatsapp");
    setCurrent(i);
    const [lo, hi] = PACES[pace];
    setUntil(Date.now() + (lo + Math.floor(Math.random() * (hi - lo + 1))) * 1000);
    return msg;
  };
  const start = async () => {
    const seen = new Set<string>();
    const items: Item[] = people
      .map((p) => ({ phone: waDigits(p.phone) ?? "", name: p.name, state: "wait" as const }))
      .filter((p) => p.phone && !seen.has(p.phone) && (seen.add(p.phone), true))
      .sort(() => Math.random() - 0.5);
    if (!items.length) return toast("مفيش أرقام صح", "error");
    const h = cairoHour();
    if ((h >= 22 || h < 9) && !(await confirmDialog({ title: "الوقت متأخر", body: "الرسايل بالليل بتجيب بلوكات وريبورتات أكتر، وده اللي بيحظر الرقم. الأحسن تبعت بكرة الصبح.", ok: "ابعت برضه" }))) return;
    const r = { items, at: Date.now(), text, context };
    setRun(r);
    open(r, 0);
  };
  /** Sent (you pressed send in WhatsApp): log it, then the next person after the wait. */
  const done = async (state: "sent" | "skipped") => {
    if (!run || current === null) return;
    const it = run.items[current]!;
    setBusy(true);
    try {
      if (state === "sent") await rpc("staff_whatsapp_web_sent", { p_phone: it.phone, p_name: it.name, p_body: fill(run.text, it.name), p_context: run.context });
      const r = { ...run, items: run.items.map((x, j) => (j === current ? { ...x, state } : x)) };
      setRun(r);
      const n = next(r);
      if (n < 0) {
        setCurrent(null);
        toast(`خلصت: ${r.items.filter((x) => x.state === "sent").length} رسالة`);
        onSent();
      } else open(r, n);
    } catch (e) {
      toast.error(waError(e));
    } finally {
      setBusy(false);
    }
  };

  if (run) {
    const sent = run.items.filter((i) => i.state === "sent").length;
    const left = run.items.filter((i) => i.state === "wait").length;
    const it = current !== null ? run.items[current] : null;
    return (
      <Card className="grid gap-3" data-testid="wa-web-run">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-chalk">بيتبعت من واتساب ويب</p>
          <Badge tone="info">
            {sent} اتبعت · {left} فاضل
          </Badge>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/5">
          <div className="h-full bg-[#1fa855]" style={{ width: `${(100 * (run.items.length - left)) / run.items.length}%` }} />
        </div>
        {it ? (
          <>
            <p className="text-sm text-mist">
              دلوقتي: <b className="text-chalk">{it.name || `+${it.phone}`}</b>. المحادثة اتفتحت والرسالة مكتوبة، دوس إرسال هناك وارجع هنا.
            </p>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Button variant="primary" loading={busy} disabled={wait > 0} onClick={() => void done("sent")} data-testid="wa-web-next">
                {wait > 0 ? `استنى ${wait} ثانية (حماية من الحظر)` : left > 1 ? "اتبعتت، اللي بعده" : "اتبعتت، خلّصنا"}
              </Button>
              <Button disabled={busy} onClick={() => void done("skipped")}>
                اتخطى
              </Button>
            </div>
            <button type="button" className="justify-self-start text-xs text-cyan" onClick={() => open(run, current!)}>
              المحادثة ماتفتحتش؟ افتحها تاني
            </button>
          </>
        ) : (
          <Button variant="primary" onClick={() => open(run, next(run))}>
            كمّل من مكانك ({left} فاضل)
          </Button>
        )}
        <Button
          size="sm"
          onClick={async () => {
            if (left && !(await confirmDialog({ title: "توقف الإرسال؟", body: `فاضل ${left}. اللي اتبعت متسجّل.`, ok: "وقّف" }))) return;
            setRun(null);
            setCurrent(null);
            setUntil(0);
          }}
        >
          {left ? "وقّف" : "رسالة جديدة"}
        </Button>
      </Card>
    );
  }
  const ready = people.length > 0 && text.replace(/\{(hi|name)\}/g, "").trim().length > 0;
  return (
    <Card className="grid gap-3" data-testid="wa-web">
      <p className="text-sm font-semibold text-chalk">إرسال من واتساب ويب</p>
      <p className="text-xs leading-relaxed text-fog">
        افتح <span dir="ltr">web.whatsapp.com</span> على الجهاز ده وامسح الـ QR من موبايل الفريق مرة واحدة. بعدها التطبيق يفتحلك محادثة كل واحد والرسالة مكتوبة باسمه، تدوس إرسال وترجع للي بعده.
      </p>
      {ui}
      <Snippets text={text} onPick={setText} />
      <Field label="الرسالة" hint="{name} = اسم كل واحد، {hi} = تحية بتتغير من رسالة للتانية (الرسايل المتطابقة بالظبط شكلها سبام).">
        <Textarea rows={5} maxLength={4096} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <Field label="السرعة" hint="وقت عشوائي بين كل رسالة والتانية، والترتيب بيتلخبط، عشان الإرسال يبان طبيعي.">
        <Select value={pace} onChange={(e) => setPace(e.target.value as keyof typeof PACES)}>
          <option value="safe">آمن: 12 لـ 25 ثانية</option>
          <option value="safer">آمن جدًا: 25 لـ 50 ثانية (للأرقام الجديدة)</option>
        </Select>
      </Field>
      <ul className="grid list-disc gap-1 ps-5 text-[11px] text-fog">
        <li>أقصى حاجة 150 رسالة في اليوم من واتساب ويب.</li>
        <li>ابعت للناس اللي يعرفوكم (المتقدمين والأعضاء)، والأحسن يكونوا حافظين رقم الفريق.</li>
        <li>مفيش لينكات كتير في أول رسالة، ومتبعتش بالليل.</li>
      </ul>
      <Button variant="primary" icon="chat" disabled={!ready} onClick={() => void start()}>
        ابدأ الإرسال ({people.length})
      </Button>
    </Card>
  );
}

function MessageLog() {
  const { data, error, loading, reload } = useAsync(
    async () => (await sb().from("whatsapp_messages").select("id, to_phone, to_name, kind, body, template, status, error, created_at, context, via").order("created_at", { ascending: false }).limit(60).then(must)) as Message[],
    [],
  );
  return (
    <Section title="آخر الرسايل" action={<Button size="sm" icon="refresh" onClick={reload} aria-label="تحديث" />}>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : !data?.length ? (
        <Empty icon="chat" title="مفيش رسايل لسه" />
      ) : (
        <List>
          {data.map((m) => (
            <Row key={m.id}>
              <div className="grid gap-1">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-chalk">{m.to_name || <span dir="ltr">+{m.to_phone}</span>}</span>
                  <Badge tone={m.status === "sent" ? "ok" : m.status === "failed" ? "danger" : "info"}>{m.status === "sent" ? "اتبعتت" : m.status === "failed" ? "فشلت" : "في الطريق"}</Badge>
                </div>
                <p className="line-clamp-2 text-xs text-fog" dir="auto">
                  {m.kind === "template" ? `قالب ${m.template}${m.body ? `: ${m.body}` : ""}` : m.body}
                </p>
                {m.error && <p className="text-[11px] text-danger" dir="auto">{m.error}</p>}
                <p className="text-[11px] text-fog/70">
                  {fmt.dateTime(m.created_at)}
                  {m.via === "web" && " · من واتساب ويب"}
                </p>
              </div>
            </Row>
          ))}
        </List>
      )}
    </Section>
  );
}
