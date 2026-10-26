"use client";
/** Above the editor of a classroom task: submit this project (running the challenge's check first when it has one). */
import { useState } from "react";
import { classroom, meStore } from "../api";
import type { CircuitDoc } from "../circuit/model";
import { useLang } from "../i18n";
import { navigate } from "../router";
import { Button, Icon, Spinner, toast } from "../ui";
import { checkChallenge } from "./check";

const ERRORS: Record<string, { en: string; ar: string }> = {
  graded: { en: "Already graded: it can't change now.", ar: "اتقيّم خلاص: مينفعش يتغيّر." },
  closed: { en: "The deadline passed and late work isn't accepted.", ar: "الميعاد عدّى والمهمة مبتقبلش تأخير." },
  project: { en: "Save the project to your account first.", ar: "احفظ المشروع في حسابك الأول." },
  not_found: { en: "This task isn't open to you.", ar: "المهمة دي مش متاحة ليك." },
};

export function AssignmentBar({ assignment, challenge, project, getDoc, save, readOnly }: { assignment: string; challenge: string | null; project: string; getDoc: () => CircuitDoc; save: () => Promise<unknown>; readOnly: boolean }) {
  const { l } = useLang();
  const me = meStore.use();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (me?.kind !== "student" || readOnly) return null;
  const submit = async () => {
    setBusy(true);
    try {
      await save();
      let checks = null;
      let passed: boolean | null = null;
      if (challenge) {
        const r = await checkChallenge(challenge, getDoc());
        if (!r.compiled) {
          toast(l({ en: "The sketch doesn't compile: fix it before submitting.", ar: "الكود مبيعملش كومبايل: صلّحه قبل التسليم." }), "danger");
          setBusy(false);
          return;
        }
        checks = r.outcome.checks;
        passed = r.outcome.passed;
      }
      const res = await classroom.submit(assignment, project, checks, passed);
      if (!res.ok) toast(l(ERRORS[res.error ?? ""] ?? { en: "Couldn't submit", ar: "معرفتش أسلّم" }), "danger");
      else {
        setDone(true);
        toast(
          challenge && !passed
            ? l({ en: "Submitted. It didn't pass the check yet; you can fix and submit again.", ar: "اتسلّم. لسه معدّاش التصحيح؛ تقدر تصلّح وتسلّم تاني." })
            : l({ en: "Submitted to your trainer", ar: "اتسلّم للمدرب" }),
          challenge && !passed ? "danger" : "ok",
        );
      }
    } catch {
      toast(l({ en: "Couldn't submit", ar: "معرفتش أسلّم" }), "danger");
    }
    setBusy(false);
  };
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] bg-ok/10 px-3 py-2 text-sm" data-testid="assignment-bar">
      <Icon name="users" className="text-ok" />
      <span className="min-w-0 flex-1 text-mist">{l({ en: "A task from your trainer.", ar: "مهمة من المدرب." })}</span>
      <Button size="sm" variant="ghost" onClick={() => navigate("classrooms")}>
        {l({ en: "Classrooms", ar: "الفصول" })}
      </Button>
      <Button size="sm" variant="primary" icon={busy ? undefined : "upload"} disabled={busy} onClick={submit} data-testid="assignment-submit">
        {busy ? <Spinner size={14} /> : null}
        {done ? l({ en: "Submit again", ar: "سلّم تاني" }) : l({ en: "Submit", ar: "سلّم" })}
      </Button>
    </div>
  );
}
