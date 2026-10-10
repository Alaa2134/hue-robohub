"use client";
/**
 * WhatsApp (Meta's WhatsApp Cloud API): the owner connects the number here, and whoever has the
 * "whatsapp" area sends to typed numbers, an expo delegation or a group of students. The access token
 * is typed once and goes straight to the database's encrypted Vault; no screen ever reads it back.
 */
import { useEffect, useMemo, useState } from "react";
import { canSee, errorText, fmt, isFull, must, rpc, sb, type StaffRow } from "./core";
import { groupsOf, useStudents } from "./staff-data";
import { Badge, Button, Card, Empty, ErrorBox, Field, Icon, Input, List, Loading, Row, Section, Select, Stat, Textarea, TopBar, confirmDialog, toast, useAsync } from "./ui";

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
type Message = { id: number; to_phone: string; to_name: string | null; kind: "text" | "template"; body: string | null; template: string | null; status: "queued" | "sent" | "failed"; error: string | null; created_at: string; context: string | null };
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
  const { data: st, error, loading, reload } = useAsync(() => rpc<Status>("staff_whatsapp_status"), []);
  // While Meta is being asked, look again every few seconds.
  useEffect(() => {
    if (st?.status !== "checking") return;
    const t = setTimeout(reload, 3000);
    return () => clearTimeout(t);
  }, [st, reload]);
  return (
    <>
      <TopBar title="واتساب" sub="ربط رقم الفريق وإرسال الرسايل من التطبيق" back="/staff/more" />
      {loading && !st ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : st ? (
        <div className="grid gap-4">
          <StatusCard st={st} />
          {st.can_connect && <ConnectCard st={st} onDone={reload} />}
          {st.connected && st.can_send && <SendCard st={st} me={me} onSent={reload} />}
          {!st.connected && !st.can_connect && (
            <Empty icon="chat" title="واتساب لسه مش مربوط" body="المالك بيربط رقم الفريق من هنا، وبعدها تقدر تبعت." />
          )}
          <MessageLog key={st.sent_today + st.failed_today} />
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

type Source = "typed" | "delegation" | "group";

function SendCard({ st, me, onSent }: { st: Status; me: StaffRow; onSent: () => void }) {
  const delegations = canSee(me, "expo") || canSee(me, "forms");
  const students = canSee(me, "training");
  const [source, setSource] = useState<Source>("typed");
  const [typed, setTyped] = useState("");
  const [formId, setFormId] = useState("");
  const [group, setGroup] = useState("");
  const [mode, setMode] = useState<"template" | "text">(st.templates.length ? "template" : "text");
  const [tpl, setTpl] = useState(st.templates[0] ? `${st.templates[0].name}|${st.templates[0].language}` : "");
  const [params, setParams] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

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
    if (source === "typed") return parsePeople(typed);
    if (source === "delegation") return (delegates.data ?? []).filter((d) => d.phone).map((d) => ({ phone: d.phone!, name: d.name ?? "" }));
    return (roster.list ?? []).filter((s) => s.active && s.phone && (!group || s.group === group)).map((s) => ({ phone: s.phone!, name: s.name }));
  }, [source, typed, delegates.data, roster.list, group]);

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
        p_context: source === "delegation" ? `expo:${formId}` : source === "group" ? `group:${group || "all"}` : null,
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
      <Field label="لمين؟">
        <Select value={source} onChange={(e) => setSource(e.target.value as Source)}>
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
      <p className="text-xs text-fog">
        {people.length ? `${people.length} ${people.length === 1 ? "شخص" : "شخص"}` : "مفيش أرقام لسه"}
        {people.length > 300 && " · أقصى حاجة 300 في المرة"}
      </p>
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
        <Field label="الرسالة" hint="بتوصل بس للي بعتلك رسالة على الرقم ده في آخر 24 ساعة (قاعدة ميتا). لغيرهم استخدم قالب. {name} = اسم كل واحد.">
          <Textarea rows={4} maxLength={4096} value={text} onChange={(e) => setText(e.target.value)} placeholder="أهلًا {name}، …" />
        </Field>
      )}
      <Button variant="primary" icon="chat" loading={busy} disabled={!ready} onClick={send}>
        ابعت
      </Button>
      {isFull(me) && <p className="text-[11px] text-fog">أقصى حاجة 300 رقم في المرة و1000 رسالة في اليوم، عشان الرقم مايتحظرش من ميتا.</p>}
    </Card>
  );
}

function MessageLog() {
  const { data, error, loading, reload } = useAsync(
    async () => (await sb().from("whatsapp_messages").select("id, to_phone, to_name, kind, body, template, status, error, created_at, context").order("created_at", { ascending: false }).limit(60).then(must)) as Message[],
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
                <p className="text-[11px] text-fog/70">{fmt.dateTime(m.created_at)}</p>
              </div>
            </Row>
          ))}
        </List>
      )}
    </Section>
  );
}
