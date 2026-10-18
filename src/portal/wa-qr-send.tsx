"use client";
/**
 * «ابعت الـ QR بالواتساب»: one tap sends every accepted person of a form (or everyone booked on an
 * event) their own QR from the team's number. It first asks the database who would get it, says how
 * many, and never sends twice to someone who already has theirs.
 */
import { useState } from "react";
import { errorText, rpc } from "./core";
import { Button, confirmDialog, go, toast } from "./ui";

type Plan = { ready: number; sent: number; already: number; no_phone: number; no_template: number };

const ERRORS: Record<string, string> = {
  whatsapp_not_connected: "واتساب مش مربوط. اربطه من شاشة واتساب الأول.",
  no_attendance: "فعّل «الحضور بالـ QR» في الفورم الأول.",
  not_found: "مش لاقيين ده.",
  forbidden: "الإرسال محتاج صلاحية واتساب كاملة.",
};

const count = (n: number) => (n === 1 ? "شخص واحد" : n === 2 ? "شخصين" : n <= 10 ? `${n} أشخاص` : `${n} شخص`);

export function SendQrButton({ kind, id, className }: { kind: "form" | "event"; id: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const fn = kind === "form" ? "staff_form_send_passes" : "staff_event_send_tickets";
  const arg = kind === "form" ? "p_form" : "p_event";
  const what = kind === "form" ? "الـ QR" : "التذكرة";
  const run = async () => {
    setBusy(true);
    try {
      const plan = await rpc<Plan>(fn, { [arg]: id, p_dry: true });
      if (!plan.ready) {
        toast(plan.already ? `كله وصله ${what} قبل كده (${plan.already})` : kind === "form" ? "مفيش مقبولين معاهم رقم لسه" : "مفيش حد مؤكَّد معاه رقم لسه", "info");
        return;
      }
      const notes = [plan.already && `${plan.already} وصلهم قبل كده ومش هيتبعتلهم تاني.`, plan.no_phone && `${plan.no_phone} من غير رقم موبايل صح.`].filter(Boolean).join(" ");
      if (
        !(await confirmDialog({
          title: `ابعت ${what} لـ ${count(plan.ready)}؟`,
          body: `كل واحد هيوصله ${what} بتاعه على واتساب من رقم الفريق.${notes ? ` ${notes}` : ""}`,
          ok: "ابعت",
        }))
      )
        return;
      const done = await rpc<Plan>(fn, { [arg]: id, p_dry: false });
      toast(`اتبعت لـ ${done.sent}${done.no_template ? ` · ${done.no_template} مااتبعتلهمش (مفيش قالب متوافق عليه مناسب)` : ""}`, done.no_template ? "error" : undefined);
    } catch (e) {
      const code = (e as { message?: string })?.message ?? "";
      toast(ERRORS[code] ?? errorText(e), "error");
      if (code === "whatsapp_not_connected") go("/staff/whatsapp");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="sm" icon="chat" loading={busy} className={className} onClick={() => void run()} data-testid={`send-qr-${kind}`}>
      ابعت {what} بالواتساب
    </Button>
  );
}
