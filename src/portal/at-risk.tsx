"use client";
/**
 * /staff/at-risk: students who need a word from their coach: missed their group's last two
 * sessions, or nothing from them in two weeks (no attendance, quiz, file opened or sign-in). The
 * team that handles students also gets a weekly notification (Sunday morning).
 * See supabase/migrations/20261009150000_coach_report_scheduled_content.sql.
 */
import { useState } from "react";
import { whatsappLink } from "@/lib/contact";
import { fmt, rpc } from "./core";
import { GroupSelect, useGroups } from "./staff-data";
import { Badge, Empty, ErrorBox, Field, Icon, List, Loading, Row, TopBar, useAsync } from "./ui";

type Line = { id: string; name: string; group: string; phone: string | null; missed: number; lastSeen: string | null; reasons: ("missed_two" | "inactive")[] };

export const atRiskCount = async () => (await rpc<Line[]>("staff_at_risk", { p_group: null })).length;

export function AtRiskScreen() {
  const groups = useGroups();
  const [group, setGroup] = useState("");
  const { data, error, loading, reload } = useAsync(() => rpc<Line[]>("staff_at_risk", { p_group: group || null }), [group]);
  return (
    <>
      <TopBar title="طلاب محتاجين متابعة" sub="غابوا آخر سيشنين، أو مختفيين من أسبوعين" back="/staff/more" />
      <Field label="المجموعة">
        <GroupSelect value={group} onChange={setGroup} groups={groups} allLabel="كل المجموعات" />
      </Field>
      <div className="mt-3">
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <ErrorBox error={error} retry={reload} />
        ) : !data?.length ? (
          <Empty icon="check" title="كله تمام 👌" body="مفيش طالب غاب آخر سيشنين أو اختفى من أسبوعين." />
        ) : (
          <List>
            {data.map((s) => {
              const msg = `أهلاً ${s.name.split(" ")[0]} 👋 وحشتنا في BuildX HUE! كله تمام؟ مستنيينك في السيشن الجاية.`;
              const wa = whatsappLink(s.phone, msg);
              return (
                <Row key={s.id} chevron={false}>
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-chalk">{s.name}</p>
                      <p className="truncate text-xs text-fog">
                        {s.group || "بدون مجموعة"} · {s.lastSeen ? `آخر نشاط ${fmt.rel(s.lastSeen)}` : "مالوش نشاط لسه"}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {s.reasons.includes("missed_two") && <Badge tone="danger">غاب آخر سيشنين</Badge>}
                        {s.reasons.includes("inactive") && <Badge tone="warn">مختفي من أسبوعين</Badge>}
                      </div>
                    </div>
                    {wa && (
                      <a href={wa} target="_blank" rel="noreferrer" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#1fae5b] text-white" aria-label={`واتساب ${s.name}`}>
                        <Icon name="share" size={18} />
                      </a>
                    )}
                  </div>
                </Row>
              );
            })}
          </List>
        )}
      </div>
    </>
  );
}
