"use client";
/**
 * «ناس من فورم» on the WhatsApp and email screens: pick any form, then who in it (the accepted, everyone
 * but the refused, the ones still under review…). Each person carries their own {link} (their QR, or
 * their status page) and {code}.
 */
import { useMemo, useState } from "react";
import { must, sb } from "./core";
import { passLink, statusLink } from "./form-attendance";
import { Field, Select, useAsync } from "./ui";
import type { WaVars } from "./wa-handoff";

type FormRow = { id: string; title_ar: string; slug: string; delegation: unknown; attendance: { on?: boolean } | null };
type Row = { name: string | null; phone: string | null; email: string | null; ref: string; pass: string | null };
export type FormPerson = { name: string; phone: string | null; email: string | null; vars: WaVars };

const WHO: [string, string][] = [
  ["accepted", "المقبولين"],
  ["all", "كل اللي ملّوه (من غير المرفوضين)"],
  ["new", "اللي لسه بيتراجعوا"],
  ["waiting", "قايمة الانتظار"],
  ["rejected", "المرفوضين"],
];

/** `active` loads only while the picker is shown; `delegationsOnly` for someone who sees the expo but not every form. */
export function useFormPick(active: boolean, delegationsOnly: boolean) {
  const [formId, setFormId] = useState("");
  const [who, setWho] = useState("accepted");
  const forms = useAsync(
    async () =>
      active
        ? ((await sb().from("forms").select("id, title_ar, slug, delegation, attendance").eq("archived", false).order("created_at", { ascending: false }).then(must)) as FormRow[])
        : [],
    [active],
  );
  const list = useMemo(() => (forms.data ?? []).filter((f) => !delegationsOnly || f.delegation), [forms.data, delegationsOnly]);
  const form = list.find((f) => f.id === formId) ?? null;
  const rows = useAsync(async () => {
    if (!form) return [];
    const q = sb().from("form_responses").select("name, phone, email, ref, pass").eq("form_id", form.id);
    return (await (who === "all" ? q.neq("status", "rejected") : q.eq("status", who)).order("created_at").limit(5000).then(must)) as Row[];
  }, [form?.id, who]);
  const people: FormPerson[] = useMemo(
    () =>
      form
        ? (rows.data ?? []).map((r) => ({
            name: r.name ?? "",
            phone: r.phone,
            email: r.email,
            vars: { code: r.ref, link: form.attendance?.on && r.pass ? passLink(r.pass) : statusLink(form.slug, r.ref), ...(r.pass ? { pass: r.pass.toLowerCase() } : {}) },
          }))
        : [],
    [rows.data, form],
  );
  const context = form ? `${form.delegation ? "expo" : "form"}:${form.id}` : null;
  const ui = (
    <>
      <Field label="الفورم">
        <Select value={formId} onChange={(e) => setFormId(e.target.value)} data-testid="pick-form">
          <option value="">اختار…</option>
          {list.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title_ar}
            </option>
          ))}
        </Select>
      </Field>
      {form && (
        <Field label="مين فيه؟">
          <Select value={who} onChange={(e) => setWho(e.target.value)} data-testid="pick-form-who">
            {WHO.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </>
  );
  return { people, context, ui };
}
