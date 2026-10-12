"use client";
/**
 * Email (through Resend): the owner connects it here once (the API key goes straight to the database's
 * encrypted Vault; no screen reads it back), and whoever has the "email" area sends to a list of people,
 * rewords or turns off the automatic emails (application received, accepted, family sign-up, contact,
 * event ticket) and sees the log.
 */
import { useEffect, useMemo, useState } from "react";
import { canSee, errorText, fmt, must, rpc, sb, type StaffRow } from "./core";
import { takeEmailHandoff, type EmailHandoff, type EmailPerson } from "./email-handoff";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorBox,
  Field,
  Icon,
  Input,
  List,
  Loading,
  Row,
  Section,
  Select,
  Sheet,
  Stat,
  Textarea,
  Toggle,
  TopBar,
  confirmDialog,
  toast,
  useAsync,
} from "./ui";

type Domain = { name: string; status: string };
type Status = {
  connected: boolean;
  status: "none" | "checking" | "ok" | "failed" | "off";
  from_email: string | null;
  from_name: string | null;
  reply_to: string | null;
  daily_limit: number;
  domains: Domain[] | null;
  domain_ok: boolean | null;
  error: string | null;
  checked_at: string | null;
  has_key: boolean;
  sent_today: number;
  failed_today: number;
  last_day: number;
  unsubscribed: number;
  my_email: string | null;
  can_send: boolean;
  can_connect: boolean;
};
type Template = { key: string; enabled: boolean; subject: string; body: string; updated_at: string };
type Message = {
  id: number;
  to_email: string;
  to_name: string | null;
  subject: string;
  kind: "manual" | "auto" | "test";
  template: string | null;
  status: "queued" | "sent" | "failed" | "skipped";
  error: string | null;
  created_at: string;
};

const ERRORS: Record<string, string> = {
  email_not_connected: "الإيميل مش مربوط أو الربط فيه مشكلة. اربطه الأول.",
  invalid_key: "مفتاح Resend شكله مش صح. بيبدأ بـ re_ وانسخه كامل.",
  key_required: "اكتب مفتاح Resend.",
  invalid_sender: "اتأكد من إيميل الإرسال والرد، والاسم من غير رموز.",
  too_many: "أقصى حاجة 300 إيميل في المرة.",
  daily_limit: "هيعدّي الحد اليومي للإيميلات. قلّل العدد أو كمّل بكرة.",
  invalid_message: "اكتب العنوان والرسالة واختار الناس.",
  invalid_email: "الإيميل ده مش صح.",
};
const emailError = (e: unknown) => ERRORS[(e as { message?: string })?.message ?? ""] ?? errorText(e);

/** What each automatic email is, and the {…} it can use. */
export const AUTO: Record<string, { label: string; when: string; vars: string }> = {
  application_received: {
    label: "طلب انضمام وصل",
    when: "أول ما حد يقدّم على الموقع",
    vars: "{name} {ref} {status_url}",
  },
  application_accepted: {
    label: "طلب اتقبل",
    when: "لما تقبل الطلب من شاشة الطلبات",
    vars: "{name} {ref} {status_url}",
  },
  application_rejected: {
    label: "طلب متقبلش",
    when: "لما ترفض الطلب (مقفول من الأول، شغّله لو حابب)",
    vars: "{name} {ref}",
  },
  family_joined: {
    label: "تسجيل في الأسرة",
    when: "لما حد يسجّل في أسرة BuildX وكتب إيميله",
    vars: "{name} {ref} {year} {group}",
  },
  contact_received: {
    label: "رسالة من صفحة التواصل",
    when: "رد تلقائي على رسايل التواصل والرعاية",
    vars: "{name} {topic}",
  },
  event_registered: {
    label: "تذكرة فعالية",
    when: "لما حد يسجّل في فعالية (المؤكَّدين بس)",
    vars: "{name} {event} {date} {place} {ticket_url}",
  },
};

const EMAIL_RE = /[^\s<>,;،]+@[^\s<>,;،]+\.[a-z]{2,24}/i;
/** "Ahmed, ahmed@x.com" / "ahmed@x.com" lines → people. */
export function parseEmails(text: string): EmailPerson[] {
  const seen = new Set<string>();
  return text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap((l) => {
      const email = (l.match(EMAIL_RE)?.[0] ?? "").toLowerCase();
      if (!email || seen.has(email)) return [];
      seen.add(email);
      return [
        {
          email,
          name: l
            .replace(EMAIL_RE, "")
            .replace(/[,،:;<>\-–]+/g, " ")
            .trim(),
        },
      ];
    });
}

/** {name} → the first name, like the database does. */
const fillName = (s: string, name: string) =>
  s.replaceAll("{name}", name.trim().split(/\s+/)[0] ?? "").replaceAll("{full_name}", name.trim());

export function EmailScreen({ me }: { me: StaffRow }) {
  const { data: st, error, loading, reload: load } = useAsync(() => rpc<Status>("staff_email_status"), []);
  const [logKey, setLogKey] = useState(0);
  const [handoff] = useState(takeEmailHandoff);
  const reload = () => (setLogKey((k) => k + 1), load());
  // While Resend is being asked, look again every few seconds.
  useEffect(() => {
    if (st?.status !== "checking") return;
    const t = setTimeout(reload, 3000);
    return () => clearTimeout(t);
  }, [st]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <TopBar
        title="الإيميل"
        sub="ربط إيميل الفريق، والإيميلات التلقائية، والإرسال للناس"
        back="/staff/more"
      />
      {loading && !st ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : st ? (
        <div className="grid gap-4">
          <StatusCard st={st} onTest={reload} />
          {st.can_connect && <ConnectCard st={st} onDone={reload} />}
          {!st.connected && !st.can_connect && (
            <Empty
              icon="mail"
              title="الإيميل لسه مش مربوط"
              body="المالك بيربطه من هنا مرة واحدة، وبعدها تقدر تبعت."
            />
          )}
          {st.connected && st.can_send && <SendCard st={st} me={me} handoff={handoff} onSent={reload} />}
          <AutoEmails canEdit={st.can_send} connected={st.connected} />
          <MessageLog key={`${st.sent_today}-${st.failed_today}-${logKey}`} />
        </div>
      ) : null}
    </>
  );
}

function StatusCard({ st, onTest }: { st: Status; onTest: () => void }) {
  const [busy, setBusy] = useState(false);
  const tone =
    st.status === "ok"
      ? "ok"
      : st.status === "checking"
        ? "info"
        : st.status === "failed"
          ? "danger"
          : "muted";
  const label = {
    ok: "مربوط",
    checking: "بنتأكد من Resend…",
    failed: "الربط فيه مشكلة",
    off: "مفصول",
    none: "مش مربوط",
  }[st.status];
  const test = async () => {
    setBusy(true);
    try {
      const r = await rpc<{ to: string }>("staff_email_test");
      toast(`اتبعت إيميل تجربة لـ ${r.to}`);
      onTest();
    } catch (e) {
      toast(emailError(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="grid gap-3" data-testid="email-status">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-full bg-cyan/15 text-cyan">
          <Icon name="mail" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-chalk">{st.from_name || "إيميل الفريق"}</p>
          <p className="truncate font-mono text-xs text-fog" dir="ltr">
            {st.from_email || "—"}
          </p>
        </div>
        <Badge tone={tone}>{label}</Badge>
      </div>
      {st.status === "failed" && st.error && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger" dir="auto">
          {st.error}
        </p>
      )}
      {st.connected && st.domain_ok === false && (
        <p
          className="rounded-lg bg-warn/10 px-3 py-2 text-xs leading-relaxed text-warn"
          data-testid="email-domain-warn"
        >
          الدومين <span dir="ltr">{st.from_email?.split("@")[1]}</span> لسه مش متأكد في Resend، فالإيميلات
          هتفشل. ادخل Resend ← Domains وضيف سجلات الـ DNS اللي بيطلبها لحد ما يبقى Verified.
        </p>
      )}
      {st.connected && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="اتبعت النهارده" value={st.sent_today} tone="ok" />
            <Stat
              label="فشل النهارده"
              value={st.failed_today}
              tone={st.failed_today ? "danger" : undefined}
            />
            <Stat label="ألغوا الاشتراك" value={st.unsubscribed} />
          </div>
          <p className="text-xs text-fog">
            آخر 24 ساعة: {st.last_day} من {st.daily_limit} (الحد اليومي)
          </p>
          {st.my_email && (
            <Button size="sm" icon="mail" loading={busy} onClick={test} data-testid="email-test">
              ابعتلي إيميل تجربة
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

function ConnectCard({ st, onDone }: { st: Status; onDone: () => void }) {
  const [open, setOpen] = useState(!st.has_key);
  const [f, setF] = useState({
    key: "",
    from: st.from_email ?? "hello@buildxhue.com",
    name: st.from_name ?? "BuildX HUE",
    reply: st.reply_to ?? "",
    limit: String(st.daily_limit ?? 100),
  });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await rpc("staff_email_connect", {
        p_key: f.key.trim(),
        p_from_email: f.from.trim(),
        p_from_name: f.name.trim(),
        p_reply_to: f.reply.trim() || null,
        p_daily_limit: Number(f.limit) || 100,
      });
      setF((x) => ({ ...x, key: "" }));
      toast("اتحفظ. بنتأكد من المفتاح مع Resend…");
      setOpen(false);
      onDone();
    } catch (e) {
      toast(emailError(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async () => {
    if (
      !(await confirmDialog({
        title: "فصل الإيميل؟",
        body: "مش هيتبعت أي إيميل (ولا التلقائية) لحد ما تربطه تاني. السجل بيفضل زي ما هو.",
        ok: "افصل",
        danger: true,
      }))
    )
      return;
    try {
      await rpc("staff_email_disconnect");
      toast("اتفصل");
      onDone();
    } catch (e) {
      toast(emailError(e), "error");
    }
  };
  if (!open)
    return (
      <div className="flex flex-wrap gap-2">
        <Button icon="settings" onClick={() => setOpen(true)}>
          تغيير الربط
        </Button>
        {st.has_key && (
          <Button variant="danger" onClick={disconnect}>
            افصل
          </Button>
        )}
      </div>
    );
  return (
    <Card className="grid gap-3" data-testid="email-connect">
      <p className="text-sm font-semibold text-chalk">
        {st.has_key ? "تغيير الربط" : "اربط إيميل الفريق (Resend)"}
      </p>
      <ol className="grid list-decimal gap-1 ps-5 text-xs leading-relaxed text-fog">
        <li>
          اعمل حساب مجاني على <span dir="ltr">resend.com</span> (100 إيميل في اليوم ببلاش).
        </li>
        <li>
          <b className="text-mist">Domains ← Add domain</b> واكتب <span dir="ltr">buildxhue.com</span>، وضيف
          سجلات الـ DNS اللي بيديهالك عند مزوّد الدومين لحد ما يبقى <b className="text-mist">Verified</b>.
        </li>
        <li>
          <b className="text-mist">API Keys ← Create API key</b> (صلاحية Full access أو Sending access) وانسخه
          هنا.
        </li>
      </ol>
      <Field
        label="مفتاح Resend (API key)"
        hint={
          st.has_key
            ? "سيبه فاضي لو مش عايز تغيّره. المفتاح بيتحفظ متشفّر ومحدش يقدر يشوفه تاني ولا حتى إنت."
            : "بيتحفظ متشفّر في قاعدة البيانات، ومحدش يقدر يشوفه تاني ولا حتى إنت."
        }
      >
        <Input
          type="password"
          autoComplete="off"
          value={f.key}
          onChange={(e) => setF({ ...f, key: e.target.value })}
          dir="ltr"
          placeholder={st.has_key ? "••••••••" : "re_…"}
        />
      </Field>
      <Field label="الإيميل اللي بنبعت منه" hint="لازم يكون على دومين متأكد في Resend.">
        <Input
          value={f.from}
          onChange={(e) => setF({ ...f, from: e.target.value })}
          dir="ltr"
          inputMode="email"
        />
      </Field>
      <Field label="اسم المرسل">
        <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} />
      </Field>
      <Field
        label="الردود تروح لـ"
        hint="إيميل حقيقي بتتابعوه (Gmail مثلًا). لو فاضي الردود هترجع لإيميل الإرسال."
      >
        <Input
          value={f.reply}
          onChange={(e) => setF({ ...f, reply: e.target.value })}
          dir="ltr"
          inputMode="email"
        />
      </Field>
      <Field label="الحد اليومي" hint="باقة Resend المجانية 100 في اليوم.">
        <Input
          value={f.limit}
          onChange={(e) => setF({ ...f, limit: e.target.value.replace(/\D/g, "") })}
          inputMode="numeric"
          dir="ltr"
        />
      </Field>
      <div className="flex gap-2">
        <Button
          variant="primary"
          icon="link"
          loading={busy}
          disabled={!f.from || (!st.has_key && !f.key)}
          onClick={save}
        >
          {st.has_key ? "احفظ" : "اربط"}
        </Button>
        {st.has_key && <Button onClick={() => setOpen(false)}>إلغاء</Button>}
      </div>
      {st.domains && st.domains.length > 0 && (
        <div className="grid gap-1">
          <p className="text-xs text-fog">الدومينات في حسابك:</p>
          {st.domains.map((d) => (
            <div key={d.name} className="flex items-center gap-2 text-xs">
              <span className="font-mono text-mist" dir="ltr">
                {d.name}
              </span>
              <Badge tone={d.status === "verified" ? "ok" : "warn"}>
                {d.status === "verified" ? "متأكد" : d.status}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

type Source = "handoff" | "typed" | "applications" | "family";

function useRecipients(me: StaffRow, handoff: EmailHandoff | null) {
  const apps = canSee(me, "applications");
  const [source, setSource] = useState<Source>(handoff ? "handoff" : "typed");
  const [typed, setTyped] = useState("");
  const [appStatus, setAppStatus] = useState("accepted");
  const applicants = useAsync(
    async () =>
      source === "applications"
        ? ((await sb()
            .from("applications")
            .select("full_name, email, status")
            .not("email", "is", null)
            .eq("status", appStatus)
            .then(must)) as { full_name: string; email: string }[])
        : [],
    [source, appStatus],
  );
  const family = useAsync(
    async () =>
      source === "family"
        ? ((await sb()
            .from("family_members")
            .select("full_name, email, status")
            .not("email", "is", null)
            .neq("status", "rejected")
            .then(must)) as { full_name: string; email: string }[])
        : [],
    [source],
  );
  const people: EmailPerson[] = useMemo(() => {
    if (source === "handoff") return handoff?.people ?? [];
    if (source === "typed") return parseEmails(typed);
    const rows = source === "applications" ? applicants.data : family.data;
    return (rows ?? []).map((r) => ({ email: r.email, name: r.full_name }));
  }, [source, typed, applicants.data, family.data, handoff]);
  const context =
    source === "handoff"
      ? (handoff?.context ?? null)
      : source === "applications"
        ? `applications:${appStatus}`
        : source === "family"
          ? "family"
          : null;
  const ui = (
    <>
      <Field label="لمين؟">
        <Select
          value={source}
          onChange={(e) => setSource(e.target.value as Source)}
          data-testid="email-source"
        >
          {handoff && <option value="handoff">{handoff.label}</option>}
          <option value="typed">إيميلات أكتبها</option>
          {apps && <option value="applications">المتقدمين للانضمام</option>}
          {apps && <option value="family">أسرة BuildX (اللي كتبوا إيميل)</option>}
        </Select>
      </Field>
      {source === "typed" && (
        <Field label="الإيميلات" hint="كل سطر: الاسم والإيميل، أو الإيميل بس.">
          <Textarea
            rows={4}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={"أحمد، ahmed@gmail.com\nsara@yahoo.com"}
            dir="auto"
          />
        </Field>
      )}
      {source === "applications" && (
        <Field label="حالة الطلب">
          <Select value={appStatus} onChange={(e) => setAppStatus(e.target.value)}>
            <option value="accepted">المقبولين</option>
            <option value="new">الجداد</option>
            <option value="interview">مستنيين مقابلة</option>
            <option value="waitlist">قائمة الانتظار</option>
          </Select>
        </Field>
      )}
      <p className="text-xs text-fog" data-testid="email-count">
        {people.length ? `${people.length} شخص` : "مفيش إيميلات لسه"}
      </p>
    </>
  );
  return { people, context, ui };
}

function SendCard({
  st,
  me,
  handoff,
  onSent,
}: {
  st: Status;
  me: StaffRow;
  handoff: EmailHandoff | null;
  onSent: () => void;
}) {
  const { people, context, ui } = useRecipients(me, handoff);
  const [subject, setSubject] = useState(handoff?.subject ?? "");
  const [text, setText] = useState(handoff?.text ?? "أهلاً {name} 👋\n\n");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const left = Math.max(0, st.daily_limit - st.last_day);
  const ready =
    people.length > 0 && subject.trim().length > 0 && text.replace(/\{name\}/g, "").trim().length > 0;
  const send = async () => {
    if (people.length > left) return toast(`فاضل ${left} إيميل النهارده بس.`, "error");
    if (
      !(await confirmDialog({
        title: `إرسال لـ ${people.length} ${people.length === 1 ? "شخص" : "أشخاص"}؟`,
        body: "الإيميلات بتتبعت فورًا من إيميل الفريق، وفي آخر كل واحد لينك إلغاء الاشتراك.",
        ok: "ابعت",
      }))
    )
      return;
    setBusy(true);
    try {
      const r = await rpc<{ queued: number; skipped: number; unsubscribed: number }>("staff_email_send", {
        p_people: people,
        p_subject: subject,
        p_text: text,
        p_context: context,
      });
      toast(
        `اتبعت ${r.queued}` +
          (r.skipped ? ` · ${r.skipped} إيميل غلط أو مكرر` : "") +
          (r.unsubscribed ? ` · ${r.unsubscribed} لغوا الاشتراك` : ""),
      );
      onSent();
    } catch (e) {
      toast(emailError(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const first = people[0]?.name ?? "أحمد";
  return (
    <Card className="grid gap-3" data-testid="email-send">
      <p className="text-sm font-semibold text-chalk">ابعت إيميل</p>
      {ui}
      <Field label="العنوان (Subject)">
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          dir="auto"
          data-testid="email-subject"
        />
      </Field>
      <Field label="الرسالة" hint="{name} = اسم كل واحد. اللينكات بتبقى قابلة للضغط لوحدها.">
        <Textarea
          rows={7}
          maxLength={20000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          dir="auto"
          data-testid="email-text"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          icon="mail"
          loading={busy}
          disabled={!ready}
          onClick={send}
          data-testid="email-send-btn"
        >
          ابعت ({people.length})
        </Button>
        <Button icon="eye" disabled={!subject && !text} onClick={() => setPreview(true)}>
          شكل الإيميل
        </Button>
      </div>
      <Sheet open={preview} onClose={() => setPreview(false)} title="شكل الإيميل">
        <EmailPreview
          subject={fillName(subject, first)}
          text={fillName(text, first)}
          from={`${st.from_name} <${st.from_email}>`}
          unsub
        />
      </Sheet>
    </Card>
  );
}

/** Close to what lands in the inbox (the database builds the real one the same way). */
export function EmailPreview({
  subject,
  text,
  from,
  unsub,
}: {
  subject: string;
  text: string;
  from: string;
  unsub?: boolean;
}) {
  const parts = text.split(/(https?:\/\/[^\s<]+)/g);
  return (
    <div className="grid gap-2" data-testid="email-preview">
      <div className="text-xs text-fog">
        <p dir="ltr" className="truncate">
          {from}
        </p>
        <p className="font-semibold text-chalk" dir="auto">
          {subject || "—"}
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl bg-white text-[#14213d]">
        <div className="bg-[#081634] px-5 py-3 text-lg font-bold text-white" dir="ltr">
          BuildX <span className="text-[#38dcff]">HUE</span>
        </div>
        <div className="whitespace-pre-wrap break-words px-5 py-5 text-[15px] leading-loose" dir="rtl">
          {parts.map((p, i) =>
            /^https?:\/\//.test(p) ? (
              <a
                key={i}
                href={p}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-[#2b6dff] underline"
              >
                {p}
              </a>
            ) : (
              <span key={i}>{p}</span>
            ),
          )}
        </div>
        <div className="bg-[#f6f8fc] px-5 py-3 text-xs leading-relaxed text-[#6b7690]" dir="rtl">
          BuildX HUE · مجتمع الروبوتكس والابتكار بجامعة حورس · buildxhue.com
          {unsub && <span className="block underline">إلغاء الاشتراك في رسايلنا</span>}
        </div>
      </div>
    </div>
  );
}

const SAMPLE: Record<string, string> = {
  name: "سارة",
  full_name: "سارة أحمد محمود",
  ref: "BX-7F3A2C",
  status_url: "https://buildxhue.com/ar/join/status/?ref=BX-7F3A2C",
  year: "2026/2027",
  group: "https://chat.whatsapp.com/…",
  topic: "general",
  event: "ورشة الأردوينو",
  date: "2026-11-02 18:00",
  place: "جامعة حورس، مبنى الهندسة",
  ticket: "BXT-1A2B3C4D",
  ticket_url: "https://buildxhue.com/ar/ticket/?t=BXT-1A2B3C4D",
};
/** The same filling as the database (a line with a {…} that has no value is left out). */
const fillSample = (s: string) =>
  s
    .split("\n")
    .filter((l) => [...l.matchAll(/\{([a-z_]+)\}/g)].every((m) => SAMPLE[m[1]!]))
    .map((l) => l.replace(/\{([a-z_]+)\}/g, (_, k: string) => SAMPLE[k] ?? ""))
    .join("\n");

function AutoEmails({ canEdit, connected }: { canEdit: boolean; connected: boolean }) {
  const { data, error, loading, reload } = useAsync(() => rpc<Template[]>("staff_email_templates"), []);
  const [edit, setEdit] = useState<Template | null>(null);
  return (
    <Section title="الإيميلات التلقائية">
      {!connected && <p className="mb-2 text-xs text-fog">بتشتغل لوحدها أول ما الإيميل يتربط.</p>}
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : (
        <List>
          {(data ?? []).map((t) => (
            <Row key={t.key} onClick={() => setEdit(t)}>
              <div className="grid gap-0.5" data-testid={`auto-${t.key}`}>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-chalk">
                    {AUTO[t.key]?.label ?? t.key}
                  </span>
                  <Badge tone={t.enabled ? "ok" : "muted"}>{t.enabled ? "شغّال" : "مقفول"}</Badge>
                </div>
                <p className="text-xs text-fog">{AUTO[t.key]?.when}</p>
                <p className="truncate text-xs text-mist" dir="auto">
                  {t.subject}
                </p>
              </div>
            </Row>
          ))}
        </List>
      )}
      {edit && <TemplateSheet t={edit} canEdit={canEdit} onClose={() => setEdit(null)} onSaved={reload} />}
    </Section>
  );
}

function TemplateSheet({
  t,
  canEdit,
  onClose,
  onSaved,
}: {
  t: Template;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [v, setV] = useState(t);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await rpc("staff_email_template_save", {
        p_key: v.key,
        p_enabled: v.enabled,
        p_subject: v.subject,
        p_body: v.body,
      });
      toast("اتحفظ");
      onSaved();
      onClose();
    } catch (e) {
      toast(emailError(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={AUTO[t.key]?.label ?? t.key}>
      <div className="grid gap-4" data-testid="auto-sheet">
        <p className="text-xs text-fog">{AUTO[t.key]?.when}</p>
        <Toggle
          checked={v.enabled}
          disabled={!canEdit}
          onChange={(enabled) => setV({ ...v, enabled })}
          label="شغّال (بيتبعت لوحده)"
        />
        <Field label="العنوان">
          <Input
            value={v.subject}
            disabled={!canEdit}
            onChange={(e) => setV({ ...v, subject: e.target.value })}
            maxLength={200}
            dir="auto"
          />
        </Field>
        <Field
          label="الرسالة"
          hint={`تقدر تستخدم: ${AUTO[t.key]?.vars ?? "{name}"}. السطر اللي فيه حاجة مش موجودة بيتشال لوحده.`}
        >
          <Textarea
            rows={10}
            value={v.body}
            disabled={!canEdit}
            onChange={(e) => setV({ ...v, body: e.target.value })}
            maxLength={8000}
            dir="auto"
          />
        </Field>
        <EmailPreview subject={fillSample(v.subject)} text={fillSample(v.body)} from="BuildX HUE" />
        {canEdit && (
          <Button variant="primary" size="lg" icon="check" loading={busy} onClick={save} block>
            حفظ
          </Button>
        )}
      </div>
    </Sheet>
  );
}

function MessageLog() {
  const { data, error, loading, reload } = useAsync(
    async () =>
      (await sb()
        .from("email_messages")
        .select("id, to_email, to_name, subject, kind, template, status, error, created_at")
        .order("created_at", { ascending: false })
        .limit(60)
        .then(must)) as Message[],
    [],
  );
  const label = { sent: "اتبعت", failed: "فشل", queued: "في الطريق", skipped: "لاغي الاشتراك" } as const;
  const tone = { sent: "ok", failed: "danger", queued: "info", skipped: "muted" } as const;
  return (
    <Section
      title="آخر الإيميلات"
      action={<Button size="sm" icon="refresh" onClick={reload} aria-label="تحديث" />}
    >
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : !data?.length ? (
        <Empty icon="mail" title="مفيش إيميلات لسه" />
      ) : (
        <List>
          {data.map((m) => (
            <Row key={m.id}>
              <div className="grid gap-1" data-testid="email-log-row">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-chalk">
                    {m.to_name || <span dir="ltr">{m.to_email}</span>}
                  </span>
                  <Badge tone={tone[m.status]}>{label[m.status]}</Badge>
                </div>
                <p className="truncate text-xs text-mist" dir="auto">
                  {m.subject}
                </p>
                {m.error && m.status !== "skipped" && (
                  <p className="text-[11px] text-danger" dir="auto">
                    {m.error}
                  </p>
                )}
                <p className="text-[11px] text-fog/70">
                  {fmt.dateTime(m.created_at)}
                  {m.kind === "auto" && ` · تلقائي (${AUTO[m.template ?? ""]?.label ?? m.template})`}
                  {m.kind === "test" && " · تجربة"}
                </p>
              </div>
            </Row>
          ))}
        </List>
      )}
    </Section>
  );
}
