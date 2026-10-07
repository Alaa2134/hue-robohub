"use client";
/**
 * Deleting an account from inside the apps (App Store / Google Play rule). Students and team members
 * send a request from their account screen; the owner carries it out or declines it from
 * /staff/deletions. See 20261008100000_deletion_requests.sql.
 */
import { useState } from "react";
import { errorText, fmt, must, rpc, sb, studentRpc } from "./core";
import { staffAdmin } from "./staff-team";
import { Badge, Button, Card, Empty, ErrorBox, Field, Icon, List, Loading, Section, Sheet, Textarea, TopBar, confirmDialog, toast, useAsync } from "./ui";

type Status = { pending: boolean; at?: string };

/** Account screen card: "delete my account", or the request already sent. */
export function DeleteAccountCard({ kind }: { kind: "student" | "staff" }) {
  const status = useAsync<Status>(() => (kind === "student" ? studentRpc<Status>("student_deletion_status") : rpc<Status>("staff_deletion_status")), [kind]);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const ok = await confirmDialog({
      title: "تبعت طلب حذف حسابك؟",
      body: kind === "student" ? "بعد الموافقة هيتحذف حسابك وحضورك ودرجات الكويزات ونقاطك نهائيًا، ومش هتقدر تدخل التطبيق." : "بعد الموافقة هيتحذف حسابك في الفريق ومش هتقدر تدخل التطبيق.",
      ok: "ابعت الطلب",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = kind === "student" ? await studentRpc<{ ok: boolean; error?: string }>("student_request_deletion", { p_reason: reason }) : await rpc<{ ok: boolean; error?: string }>("staff_request_deletion", { p_reason: reason });
      if (!r.ok) throw new Error(r.error === "owner" ? "حساب المالك ما ينفعش يتحذف من هنا." : r.error === "rate_limited" ? "محاولات كتير. جرّب بعد ساعة." : "مقدرناش نبعت الطلب.");
      toast("اتبعت طلب حذف الحساب");
      setOpen(false);
      status.reload();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };

  if (!status.data) return null;
  if (status.data.pending)
    return (
      <Card className="mt-6 flex items-start gap-3 border-warn/30 bg-warn/[0.06]">
        <Icon name="alert" size={20} className="mt-0.5 shrink-0 text-warn" />
        <p className="text-sm leading-relaxed text-mist">
          طلب حذف حسابك اتبعت {status.data.at ? fmt.dateTime(status.data.at) : ""}. هيتنفذ خلال 30 يوم بالكتير، ولحد ده حسابك شغال عادي. لو غيّرت رأيك كلّم {kind === "student" ? "مدربك" : "المالك"}.
        </p>
      </Card>
    );
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mx-auto mt-6 flex items-center gap-1.5 text-sm text-fog underline-offset-4 hover:text-[#ff9aa5] hover:underline">
        <Icon name="trash" size={15} />
        حذف حسابي
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="حذف حسابي">
        <div className="grid gap-4">
          <p className="text-sm leading-relaxed text-mist">
            {kind === "student"
              ? "حسابك بيعمله فريق التدريب، فالحذف بيتم بطلب: المالك بيراجعه ويحذف حسابك وكل بياناته (الحضور، الكويزات، النقاط) خلال 30 يوم."
              : "حسابات الفريق بيعملها المالك، فالحذف بيتم بطلب: المالك بيراجعه ويحذف حسابك خلال 30 يوم."}
          </p>
          <Field label="السبب (اختياري)">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="min-h-20" />
          </Field>
          <Button variant="danger" size="lg" block loading={busy} onClick={send}>
            ابعت طلب الحذف
          </Button>
        </div>
      </Sheet>
    </>
  );
}

type Req = { id: string; kind: "student" | "staff"; student_id: string | null; user_id: string | null; name: string; identifier: string; reason: string; status: "pending" | "done" | "rejected"; created_at: string; handled_at: string | null };

/** Owner: how many requests are waiting (home card). */
export async function pendingDeletions(): Promise<number> {
  const { count } = await sb().from("deletion_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
  return count ?? 0;
}

/** /staff/deletions (owner only). */
export function DeletionsScreen() {
  const { data, error, loading, reload } = useAsync(async () => must(await sb().from("deletion_requests").select("*").order("created_at", { ascending: false }).limit(200)) as Req[], []);
  const [busy, setBusy] = useState<string | null>(null);

  const resolve = async (r: Req, approve: boolean) => {
    const ok = await confirmDialog(
      approve
        ? { title: `حذف حساب ${r.name || r.identifier} نهائيًا؟`, body: r.kind === "student" ? "هيتحذف الطالب وحضوره وكويزاته ونقاطه وأجهزته. الشهادات بتفضل في السجل من غير ربط بالحساب. ما ينفعش ترجع فيه." : "هيتحذف حساب عضو الفريق ومش هيقدر يدخل تاني. ما ينفعش ترجع فيه.", ok: "احذف نهائيًا", danger: true }
        : { title: "رفض الطلب؟", body: "الحساب هيفضل شغال. بلّغ صاحبه بالسبب.", ok: "رفض" },
    );
    if (!ok) return;
    setBusy(r.id);
    try {
      if (approve && r.kind === "staff" && r.user_id) await staffAdmin({ action: "delete", userId: r.user_id });
      const out = await rpc<{ ok: boolean; error?: string }>("staff_resolve_deletion", { p_request: r.id, p_approve: approve });
      if (!out.ok) throw new Error(out.error === "not_found" ? "الطلب ده اتقفل قبل كده." : "مقدرناش نقفل الطلب.");
      toast(approve ? "اتحذف الحساب" : "اترفض الطلب");
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const pending = data?.filter((r) => r.status === "pending") ?? [];
  const done = data?.filter((r) => r.status !== "pending") ?? [];
  return (
    <>
      <TopBar title="طلبات حذف الحسابات" sub="المتاجر بتطلب إن الحذف يتنفذ خلال 30 يوم" back="/staff/more" />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : !pending.length && !done.length ? (
        <Empty icon="trash" title="مفيش طلبات حذف" body="لما طالب أو عضو في الفريق يطلب حذف حسابه من التطبيق، الطلب بيظهر هنا." />
      ) : (
        <>
          {pending.length > 0 ? (
            <div className="grid gap-3">
              {pending.map((r) => (
                <Card key={r.id} className="grid gap-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-chalk">
                        <bdi>{r.name || "—"}</bdi>
                      </p>
                      <p className="text-xs text-fog">
                        <span dir="ltr" className="font-mono">
                          {r.identifier}
                        </span>{" "}
                        · {fmt.dateTime(r.created_at)}
                      </p>
                    </div>
                    <Badge tone={r.kind === "student" ? "info" : "volt"}>{r.kind === "student" ? "طالب" : "فريق"}</Badge>
                  </div>
                  {r.reason && <p className="rounded-xl bg-white/[0.04] p-3 text-sm text-mist">{r.reason}</p>}
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="danger" icon="trash" loading={busy === r.id} onClick={() => resolve(r, true)}>
                      احذف الحساب
                    </Button>
                    <Button disabled={busy === r.id} onClick={() => resolve(r, false)}>
                      رفض
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="text-sm text-mist">مفيش طلبات مستنية.</Card>
          )}
          {done.length > 0 && (
            <Section title="اللي اتقفل">
              <List>
                {done.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1 truncate text-sm text-mist">{r.status === "done" ? "حساب اتحذف" : <bdi>{r.name || r.identifier}</bdi>}</span>
                    <span className="text-xs text-fog">{r.handled_at ? fmt.dateTime(r.handled_at) : ""}</span>
                    <Badge tone={r.status === "done" ? "danger" : "muted"}>{r.status === "done" ? "اتحذف" : "اترفض"}</Badge>
                  </div>
                ))}
              </List>
            </Section>
          )}
        </>
      )}
    </>
  );
}
