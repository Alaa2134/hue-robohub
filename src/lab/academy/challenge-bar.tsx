"use client";
/** The challenge's goal, hints and check, above the editor of a challenge project. */
import { useState } from "react";
import { academy, meStore } from "../api";
import type { CircuitDoc } from "../circuit/model";
import { useLang } from "../i18n";
import { Button, Icon, Spinner, cn, toast } from "../ui";
import { challengeBySlug, type Outcome } from "./challenges";
import { checkChallenge } from "./check";

/** In the editor of a challenge project: the goal, hints, and the check on the current sketch. */
export function ChallengeBar({ slug, project, getDoc, readOnly }: { slug: string; project: string; getDoc: () => CircuitDoc; readOnly: boolean }) {
  const { l } = useLang();
  const me = meStore.use();
  const c = challengeBySlug(slug);
  const [state, setState] = useState<"idle" | "checking">("idle");
  const [result, setResult] = useState<Outcome | null>(null);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [hints, setHints] = useState(false);
  if (!c) return null;
  const run = async () => {
    setState("checking");
    setErrors(null);
    setResult(null);
    try {
      const r = await checkChallenge(slug, getDoc());
      if (!r.compiled) setErrors(r.errors.map((e) => `${e.file}:${e.line} ${e.message}`).slice(0, 4));
      else {
        setResult(r.outcome);
        if (r.outcome.passed && me?.kind === "student") {
          const saved = await academy.pass(slug, project, r.outcome.checks, r.outcome.seconds).catch(() => null);
          toast(saved?.ok ? l({ en: "Passed and saved to your progress", ar: "عدّيت واتحسبلك" }) : l({ en: "Passed, but saving failed", ar: "عدّيت بس الحفظ فشل" }), saved?.ok ? "ok" : "danger");
        }
      }
    } catch {
      toast(l({ en: "The check couldn't run", ar: "التصحيح مشتغلش" }), "danger");
    }
    setState("idle");
  };
  return (
    <div className="grid gap-2 border-b border-[var(--line)] bg-volt/10 px-3 py-2 text-sm" data-testid="challenge-bar">
      <div className="flex flex-wrap items-center gap-2">
        <Icon name="trophy" className="text-cyan" />
        <span className="font-semibold">{l(c.title)}</span>
        <span className="min-w-0 flex-1 text-mist">{l(c.goal)}</span>
        <Button size="sm" variant="ghost" onClick={() => setHints((h) => !h)}>
          {l({ en: "Hints", ar: "تلميحات" })}
        </Button>
        <Button size="sm" variant="primary" icon={state === "checking" ? undefined : "check"} disabled={state === "checking" || readOnly} onClick={run} data-testid="challenge-check">
          {state === "checking" ? <Spinner size={14} /> : null}
          {state === "checking" ? l({ en: "Checking…", ar: "بتأكد…" }) : l({ en: "Check", ar: "اتأكد" })}
        </Button>
      </div>
      {hints && (
        <ul className="grid gap-1 ps-6 text-xs text-mist">
          {c.hints.map((h, i) => (
            <li key={i} className="list-disc">
              {l(h)}
            </li>
          ))}
        </ul>
      )}
      {errors && (
        <div className="rounded-lg bg-danger/10 p-2 text-xs text-danger" dir="ltr">
          <p className="mb-1 font-semibold" dir="auto">
            {l({ en: "The sketch doesn't compile:", ar: "الكود مبيعملش كومبايل:" })}
          </p>
          {errors.map((e, i) => (
            <p key={i} className="font-mono">
              {e}
            </p>
          ))}
        </div>
      )}
      {result && (
        <div className="grid gap-1" data-testid="challenge-result">
          <p className={cn("font-semibold", result.passed ? "text-ok" : "text-warn")}>
            {result.passed ? l({ en: "Passed! 🎉", ar: "عدّيت! 🎉" }) : l({ en: "Not yet — here's what the simulator saw:", ar: "لسه — ده اللي المحاكي شافه:" })}
          </p>
          <ul className="grid gap-0.5">
            {result.checks.map((k, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <Icon name={k.ok ? "check" : "x"} size={14} className={k.ok ? "text-ok" : "text-danger"} />
                <span>{l(k.label)}</span>
                {k.got && (
                  <span className="font-mono text-fog" dir="ltr">
                    {k.got}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {result.passed && !me && <p className="text-xs text-fog">{l({ en: "Sign in with your student code to have it counted.", ar: "سجّل دخول بكود الطالب عشان يتحسبلك." })}</p>}
        </div>
      )}
    </div>
  );
}
