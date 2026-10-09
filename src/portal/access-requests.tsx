"use client";
/**
 * "Forgot my PIN / password": the request from the sign-in screen, and /staff/access where the team
 * answers it (a new PIN for a student, a new temporary password for a team member), with the message
 * ready to send on WhatsApp. See supabase/migrations/20261009110000_access_requests.sql.
 */
import { useState } from "react";
import { isFull, errorText, fmt, rpc, tempPassword, type StaffRow } from "./core";
import { PinResults, type PinItem } from "./staff-students";
import { CredentialsSheet, staffAdmin, type Credentials } from "./staff-team";
import { Badge, Button, Card, Empty, ErrorBox, Field, Icon, Input, List, Loading, Row, TopBar, confirmDialog, toast, useAsync } from "./ui";

type Request = {
  id: string;
  kind: "pin" | "password";
  note: string;
  at: string;
  studentId: string | null;
  staffUserId: string | null;
  name: string;
  code: string | null;
  group: string | null;
  email: string | null;
  phone: string | null;
};

export const pendingAccessRequests = async () => (await rpc<Request[]>("staff_access_requests")).length;

/** Sign-in screen: ask the team for a new PIN or password. */
export function ForgotForm({ initial, onClose }: { initial: string; onClose: () => void }) {
  const [ident, setIdent] = useState(initial);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const team = ident.includes("@");

  const send = async () => {
    if (ident.trim().length < 2) return toast("اكتب رقم الطالب أو الإيميل", "error");
    setBusy(true);
    try {
      const r = await rpc<{ ok: boolean; error?: string }>("request_access_help", { p_ident: ident.trim(), p_note: note.trim() });
      if (!r.ok) return toast(r.error === "rate_limited" ? "طلبات كتير من نفس الشبكة. جرّب بعد شوية." : "اكتب رقم الطالب أو الإيميل صح", "error");
      setSent(true);
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };

  if (sent)
    return (
      <Card className="mt-4 grid gap-3 text-center">
        <Icon name="check" size={30} className="mx-auto text-ok" />
        <p className="text-[15px] leading-relaxed text-mist">
          {team ? "وصل طلبك للمالك. هيبعتلك كلمة مرور مؤقتة جديدة." : "وصل طلبك للمدرّبين. هيبعتولك رمز دخول جديد."}
        </p>
        <Button onClick={onClose}>تمام</Button>
      </Card>
    );
  return (
    <Card className="mt-4 grid gap-3">
      <p className="font-semibold text-chalk">نسيت رمز الدخول أو كلمة المرور؟</p>
      <Field label="رقم الطالب أو البريد الإلكتروني">
        <Input value={ident} onChange={(e) => setIdent(e.target.value)} dir="ltr" className="text-center font-mono" autoCapitalize="off" />
      </Field>
      <Field label="رقم موبايلك أو ملاحظة (اختياري)" hint="عشان الفريق يعرف يوصلك">
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </Field>
      <div className="flex gap-2">
        <Button variant="primary" loading={busy} onClick={send}>
          ابعت الطلب
        </Button>
        <Button onClick={onClose}>إلغاء</Button>
      </div>
    </Card>
  );
}

/** /staff/access: pending requests this person can answer. */
export function AccessRequestsScreen({ me }: { me: StaffRow }) {
  const list = useAsync(() => rpc<Request[]>("staff_access_requests"), []);
  const [pins, setPins] = useState<PinItem[] | null>(null);
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const resolve = (id: string, status: "done" | "declined") => rpc("staff_access_resolve", { p_id: id, p_status: status });

  const answer = async (r: Request) => {
    setBusy(r.id);
    try {
      if (r.kind === "pin") {
        setPins(await rpc<PinItem[]>("staff_set_pins", { p_ids: [r.studentId], p_only_missing: false }));
      } else {
        const password = tempPassword();
        await staffAdmin({ action: "set_password", userId: r.staffUserId, password });
        setCreds({ name: r.name, email: r.email ?? "", password });
      }
      await resolve(r.id, "done");
      list.reload();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(null);
    }
  };
  const decline = async (r: Request) => {
    if (!(await confirmDialog({ title: "تجاهل الطلب؟", body: `${r.name} مش هيوصله رمز جديد.`, ok: "تجاهل", danger: true }))) return;
    await resolve(r.id, "declined").catch((e) => toast(errorText(e), "error"));
    list.reload();
  };

  return (
    <>
      <TopBar title="طلبات الدخول" sub="ناس نسيت رمز الدخول أو كلمة المرور" back="/staff/more" />
      <p className="mb-3 text-sm leading-relaxed text-fog">اتأكد إن الطلب من صاحب الحساب (كلّمه أو شوفه في السيشن) قبل ما تبعتله رمز جديد.</p>
      {list.loading && !list.data ? (
        <Loading />
      ) : list.error ? (
        <ErrorBox error={list.error} retry={list.reload} />
      ) : !list.data?.length ? (
        <Empty icon="key" title="مفيش طلبات" body="لما حد يدوس «نسيت؟» في شاشة الدخول، طلبه بيظهر هنا ويوصلك إشعار." />
      ) : (
        <List>
          {list.data.map((r) => (
            <Row key={r.id} chevron={false}>
              <div className="grid gap-2">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate font-semibold text-chalk">{r.name}</p>
                  <Badge tone={r.kind === "pin" ? "volt" : "warn"}>{r.kind === "pin" ? "طالب" : "فريق"}</Badge>
                </div>
                <p className="text-xs text-fog" dir="auto">
                  {r.kind === "pin" ? `${r.code} · ${r.group || "بدون مجموعة"}` : r.email} · {fmt.rel(r.at)}
                </p>
                {(r.note || r.phone) && <p className="text-sm text-mist">{[r.note, r.phone].filter(Boolean).join(" · ")}</p>}
                <div className="flex gap-2">
                  <Button size="sm" variant="primary" icon="key" loading={busy === r.id} onClick={() => answer(r)}>
                    {r.kind === "pin" ? "رمز جديد" : "كلمة مرور جديدة"}
                  </Button>
                  <Button size="sm" onClick={() => decline(r)}>
                    تجاهل
                  </Button>
                </div>
              </div>
            </Row>
          ))}
        </List>
      )}
      {!isFull(me) && <p className="mt-4 text-xs text-fog">طلبات كلمات مرور الفريق بتظهر للمالك والمشرفين بس.</p>}
      <PinResults items={pins} onClose={() => setPins(null)} />
      <CredentialsSheet creds={creds} onClose={() => setCreds(null)} />
    </>
  );
}
