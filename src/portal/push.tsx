"use client";
/** Push notifications in the BuildX App: turning them on for this device (browser or phone app), and the staff "send" screen. */
import { useEffect, useState } from "react";
import { APP_PATH, errorText, isNative, fmt, must, rpc, sb, studentRpc, type StaffRow } from "./core";
import { enableNativePush, nativePushState } from "./native-push";
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
  // The store app uses the phone's own notifications.
  if (isNative()) return nativePushState();
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return isIos() && !standalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration(APP_PATH);
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

export async function enablePush(kind: "student" | "staff") {
  if (isNative()) {
    const state = await enableNativePush(kind);
    if (state !== "on") throw new Error(state);
    return;
  }
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
    pushState().then((s) => {
      setState(s);
      // In the app, refresh this phone's token for whoever is signed in now (it can change).
      if (s === "on" && isNative()) enableNativePush(kind, false).catch(() => undefined);
    }, () => setState("unsupported"));
  }, [kind]);
  if (!state || state === "on" || state === "unsupported") return null;
  const turnOn = async () => {
    setBusy(true);
    try {
      await enablePush(kind);
      setState("on");
      toast("الإشعارات اشتغلت ✓");
    } catch (e) {
      if ((e as Error).message === "denied" || (!isNative() && Notification.permission === "denied")) setState("denied");
      else if ((e as Error).message !== "off") toast(errorText(e), "error");
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
              ? isNative()
                ? "الإشعارات مقفولة من إعدادات الموبايل. افتحها من الإعدادات ← BuildX HUE ← الإشعارات."
                : "الإشعارات مقفولة من إعدادات المتصفح. افتحها من إعدادات الموقع."
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

type KeysStatus = { web: boolean; android: boolean; ios: boolean; devices: { android: number; ios: number } };

/**
 * Owner only: the keys that let the phone app get notifications. Pasted once from the Firebase and
 * Apple consoles; stored in the database and never shown again (the screen only says "set").
 */
function PushKeysCard() {
  const status = useAsync(() => rpc<KeysStatus>("staff_push_keys_status"), []);
  const [open, setOpen] = useState(false);
  const [k, setK] = useState({ fcm: "", p8: "", keyId: "", teamId: "" });
  const [busy, setBusy] = useState(false);
  const readFile = (set: (v: string) => void) => (e: { target: HTMLInputElement }) => {
    const f = e.target.files?.[0];
    if (f) f.text().then(set, () => toast("مقدرتش أقرا الملف", "error"));
  };
  const save = async () => {
    if (!k.fcm.trim() && !k.p8.trim()) return toast("حط ملف Firebase أو مفتاح Apple", "error");
    setBusy(true);
    try {
      const r = await rpc<{ ok: boolean; error?: string }>("staff_set_push_keys", {
        p_fcm: k.fcm.trim() || null,
        p_apns_p8: k.p8.trim() || null,
        p_apns_key_id: k.keyId.trim().toUpperCase() || null,
        p_apns_team_id: k.teamId.trim().toUpperCase() || null,
      });
      if (!r.ok)
        return toast(r.error === "fcm_json" ? "ده مش ملف Service account من Firebase" : "راجع مفتاح Apple: ملف .p8 و Key ID و Team ID (10 حروف/أرقام)", "error");
      toast("اتحفظت ✓");
      setK({ fcm: "", p8: "", keyId: "", teamId: "" });
      setOpen(false);
      status.reload();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const d = status.data;
  return (
    <Section title="إشعارات التطبيق على الموبايل">
      <Card className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge tone={d?.android ? "ok" : "muted"}>Android {d?.android ? "✓" : "—"}</Badge>
          <Badge tone={d?.ios ? "ok" : "muted"}>iPhone {d?.ios ? "✓" : "—"}</Badge>
          {d && (
            <span className="text-xs text-fog">
              {d.devices.android} أندرويد · {d.devices.ios} آيفون مسجّلين
            </span>
          )}
        </div>
        <p className="text-xs leading-relaxed text-fog">
          عشان الإشعارات توصل للتطبيق: من Firebase ← Project settings ← Service accounts ← Generate new private key (ملف JSON)، ومن Apple Developer ← Keys ← مفتاح APNs (ملف .p8). الخطوات كاملة في mobile/README.md. المفاتيح بتتحفظ ومبتظهرش تاني.
        </p>
        {!open ? (
          <Button size="sm" icon="key" onClick={() => setOpen(true)}>
            {d?.android || d?.ios ? "تغيير المفاتيح" : "إضافة المفاتيح"}
          </Button>
        ) : (
          <div className="grid gap-3">
            <Field label="Firebase (Android): ملف Service account JSON">
              <Input type="file" accept=".json,application/json" onChange={readFile((v) => setK((p) => ({ ...p, fcm: v })))} />
            </Field>
            <Field label="Apple (iPhone): ملف AuthKey .p8">
              <Input type="file" accept=".p8" onChange={readFile((v) => setK((p) => ({ ...p, p8: v })))} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Key ID">
                <Input value={k.keyId} onChange={(e) => setK((p) => ({ ...p, keyId: e.target.value }))} dir="ltr" maxLength={10} className="font-mono uppercase" />
              </Field>
              <Field label="Team ID">
                <Input value={k.teamId} onChange={(e) => setK((p) => ({ ...p, teamId: e.target.value }))} dir="ltr" maxLength={10} className="font-mono uppercase" />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button variant="primary" loading={busy} onClick={save}>
                حفظ
              </Button>
              <Button onClick={() => setOpen(false)}>إلغاء</Button>
            </div>
          </div>
        )}
      </Card>
    </Section>
  );
}

/** /staff/notify (who may send notifications): write and send one, and see what was sent. */
export function NotifyScreen({ me }: { me: StaffRow }) {
  const students = useStudents();
  const groups = groupsOf(students.list);
  const history = useAsync(async () => (await sb().from("push_messages").select("id,title,body,audience,group_name,created_at,targets,delivered").is("to_staff", null).order("created_at", { ascending: false }).limit(50).then(must)) as Msg[], []);
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
      {me.role === "owner" && <PushKeysCard />}
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
