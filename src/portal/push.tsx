"use client";
/** Push notifications in the BuildX App: turning them on for this device, and the staff "send" screen. */
import { useEffect, useState } from "react";
import { APP_PATH, errorText, fmt, must, rpc, sb, studentRpc } from "./core";
import { groupsOf, useStudents } from "./staff-data";
import { Badge, Button, Card, Chip, Empty, ErrorBox, Field, Icon, Input, List, Loading, Row, Section, Textarea, TopBar, toast, useAsync } from "./ui";

/** Public half of the VAPID key (the private half lives only in the database). */
export const VAPID_PUBLIC = "BAsr-kyv688KZIr1ZgXcHuPNNuJQ3uPXtoHSNSiF-1ryCB6HsDCl4FCmcjGavQyMqMzDpaDFAyiryRlLUJ_fEN8";

type State = "unsupported" | "ios-install" | "denied" | "off" | "on";

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

function keyBytes(b64: string) {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration(APP_PATH)) ?? (await navigator.serviceWorker.register(`${APP_PATH}sw.js`, { scope: APP_PATH }));
}

export async function pushState(): Promise<State> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return isIos() && !standalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration(APP_PATH);
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

export async function enablePush(kind: "student" | "staff") {
  if ((await Notification.requestPermission()) !== "granted") throw new Error("denied");
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) }));
  const json = sub.toJSON();
  const out = kind === "student" ? await studentRpc<{ ok: boolean }>("push_subscribe_student", { p_sub: json }) : await rpc<{ ok: boolean }>("push_subscribe_staff", { p_sub: json });
  if (!out.ok) throw new Error("subscribe_failed");
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration(APP_PATH);
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await rpc("push_unsubscribe", { p_endpoint: sub.endpoint }).catch(() => undefined);
  await sub.unsubscribe();
}

/** "Turn on notifications" card (student home, staff "more"). Hidden once they're on. */
export function PushCard({ kind }: { kind: "student" | "staff" }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    pushState().then(setState, () => setState("unsupported"));
  }, []);
  if (!state || state === "on" || state === "unsupported") return null;
  const turnOn = async () => {
    setBusy(true);
    try {
      await enablePush(kind);
      setState("on");
      toast("الإشعارات اشتغلت ✓");
    } catch (e) {
      if (Notification.permission === "denied") setState("denied");
      else toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="mt-3 flex items-center gap-3 border-volt/30">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-volt/15 text-[#8fb5ff]">
        <Icon name="bell" size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-chalk">إشعارات على موبايلك</p>
        <p className="text-xs leading-relaxed text-fog">
          {state === "ios-install"
            ? "على الآيفون: دوس مشاركة ← «إضافة إلى الشاشة الرئيسية» وافتح التطبيق من هناك عشان الإشعارات تشتغل."
            : state === "denied"
              ? "الإشعارات مقفولة من إعدادات المتصفح. افتحها من إعدادات الموقع."
              : kind === "student"
                ? "كويز جديد، تغيير ميعاد، أو إعلان مهم — يوصلك على طول."
                : "تنبيه لما يحصل حاجة مهمة في التطبيق."}
        </p>
      </div>
      {state === "off" && (
        <Button size="sm" variant="primary" loading={busy} onClick={turnOn}>
          تشغيل
        </Button>
      )}
    </Card>
  );
}

type Msg = { id: string; title: string; body: string; audience: string; group_name: string | null; created_at: string; targets: number | null; delivered: number | null };
const AUD: Record<string, string> = { students: "كل الطلاب", group: "مجموعة", staff: "الفريق", everyone: "الكل" };

/** /staff/notify (owners/admins): write and send a notification, and see what was sent. */
export function NotifyScreen() {
  const students = useStudents();
  const groups = groupsOf(students.list);
  const history = useAsync(async () => (await sb().from("push_messages").select("id,title,body,audience,group_name,created_at,targets,delivered").order("created_at", { ascending: false }).limit(50).then(must)) as Msg[], []);
  const devices = useAsync(async () => {
    const r = await sb().from("push_subscriptions").select("audience", { count: "exact", head: false }).is("disabled_at", null).limit(5000);
    const rows = (r.data ?? []) as { audience: string }[];
    return { students: rows.filter((x) => x.audience === "student").length, staff: rows.filter((x) => x.audience === "staff").length };
  }, []);
  const [f, setF] = useState({ title: "", body: "", url: "", audience: "students", group: "" });
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (f.title.trim().length < 2) return toast("اكتب عنوان الإشعار", "error");
    if (f.audience === "group" && !f.group) return toast("اختار المجموعة", "error");
    if (f.url.trim() && !/^(https:\/\/|\/)/.test(f.url.trim())) return toast("اللينك لازم يبدأ بـ https:// أو /", "error");
    setBusy(true);
    try {
      const { data, error } = await sb().functions.invoke<{ ok: boolean; targets: number; delivered: number; error?: string }>("send-push", { body: { ...f, url: f.url.trim() || "/app/" } });
      if (error || !data?.ok) throw error ?? new Error(data?.error ?? "send_failed");
      toast(`اتبعت لـ ${data.delivered} من ${data.targets} جهاز`);
      setF((p) => ({ ...p, title: "", body: "" }));
      history.reload();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TopBar title="إرسال إشعار" sub={devices.data ? `${devices.data.students} جهاز طالب · ${devices.data.staff} جهاز فريق` : undefined} back="/staff/more" />
      <Card className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          {(["students", "group", "staff", "everyone"] as const).map((a) => (
            <Chip key={a} active={f.audience === a} onClick={() => setF((p) => ({ ...p, audience: a }))}>
              {AUD[a]}
            </Chip>
          ))}
        </div>
        {f.audience === "group" && (
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => (
              <Chip key={g} active={f.group === g} onClick={() => setF((p) => ({ ...p, group: g }))}>
                {g}
              </Chip>
            ))}
            {!groups.length && <p className="text-sm text-fog">مفيش مجموعات لسه.</p>}
          </div>
        )}
        <Field label="العنوان">
          <Input value={f.title} onChange={(e) => setF((p) => ({ ...p, title: e.target.value }))} maxLength={80} placeholder="كويز جديد اتنشر 🎯" />
        </Field>
        <Field label="الرسالة (اختياري)">
          <Textarea value={f.body} onChange={(e) => setF((p) => ({ ...p, body: e.target.value }))} maxLength={240} className="min-h-20" />
        </Field>
        <Field label="يفتح على (اختياري)" hint="صفحة في التطبيق زي /app/#/me/quizzes أو لينك https://">
          <Input value={f.url} onChange={(e) => setF((p) => ({ ...p, url: e.target.value }))} dir="ltr" placeholder="/app/#/me/quizzes" />
        </Field>
        <Button variant="primary" size="lg" block loading={busy} onClick={send}>
          إرسال
        </Button>
      </Card>
      <PushCard kind="staff" />
      <Section title="اللي اتبعت">
        {history.loading && !history.data ? (
          <Loading />
        ) : history.error ? (
          <ErrorBox error={history.error} retry={history.reload} />
        ) : !history.data?.length ? (
          <Empty icon="bell" title="لسه مفيش إشعارات" />
        ) : (
          <List>
            {history.data.map((m) => (
              <Row key={m.id} chevron={false}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-chalk">{m.title}</p>
                    <p className="truncate text-xs text-fog">
                      {AUD[m.audience]}
                      {m.group_name ? ` · ${m.group_name}` : ""} · {fmt.rel(m.created_at)}
                    </p>
                  </div>
                  <Badge tone={m.delivered ? "ok" : "muted"}>{m.targets == null ? "…" : `${m.delivered}/${m.targets}`}</Badge>
                </div>
              </Row>
            ))}
          </List>
        )}
      </Section>
    </>
  );
}
