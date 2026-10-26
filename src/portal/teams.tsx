"use client";
/**
 * /me/teams — Projects & Team Matching. A student posts a project idea and the skills it needs; others
 * ask to join with a message and what they bring. Open teams that need what the student has shown in
 * the Lab come first ("verified" means Lab challenges passed in that area; anything else is what the
 * student says). The owner's contact link is for members only. Names are a first name and an initial.
 * The team side (/teams in the staff app) can close a team that breaks the rules.
 */
import { useState } from "react";
import { passportUrl } from "./passport";
import { rpc, studentRpc } from "./core";
import { Badge, Button, Card, Chip, Empty, ErrorBox, Field, Input, Loading, Sheet, Textarea, TopBar, toast, useAsync } from "./ui";

export const SKILLS = {
  programming: "برمجة",
  electronics: "إلكترونيات",
  robotics: "روبوتات",
  mechanical: "ميكانيكا",
  cad: "تصميم 3D",
  design: "تصميم جرافيك",
  ai: "ذكاء اصطناعي",
  business: "بيزنس وعرض",
} as const;
type Skill = keyof typeof SKILLS;
const skillName = (s: string) => SKILLS[s as Skill] ?? s;

type Member = { name: string; owner: boolean; me: boolean };
type Req = { id: string; name: string; message: string; skills: Skill[]; verified: Record<string, number>; passport: string | null; at: string };
type MyTeam = { id: string; title: string; idea: string; needs: Skill[]; size_max: number; status: "open" | "full" | "closed"; closed_reason: string | null; owner: boolean; contact: string | null; members: Member[]; requests: Req[] | null };
type OpenTeam = { id: string; title: string; idea: string; needs: Skill[]; size_max: number; owner: string; group: string | null; members: number; match: Skill[]; request: "pending" | "accepted" | "declined" | null };
type Data = { skills: Record<string, number>; mine: MyTeam[]; open: OpenTeam[] };

const ERR: Record<string, string> = {
  title: "اكتب اسم للمشروع (٣ حروف على الأقل)",
  contact: "لينك التواصل لازم يبدأ بـ https://",
  too_many: "وصلت للحد المسموح",
  rate_limited: "محاولات كتير النهارده، جرّب بكرة",
  not_open: "الفريق ده مبقاش بيستقبل طلبات",
  already: "انت باعت طلب للفريق ده قبل كده",
  full: "الفريق اكتمل",
};
const fail = (e?: string) => toast(ERR[e ?? ""] ?? "حصلت مشكلة، جرّب تاني", "error");

function SkillPicker({ value, onChange }: { value: Skill[]; onChange: (v: Skill[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(SKILLS) as Skill[]).map((s) => (
        <Chip key={s} active={value.includes(s)} onClick={() => onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s])}>
          {SKILLS[s]}
        </Chip>
      ))}
    </div>
  );
}

function TeamEditor({ team, onClose, onSaved }: { team: MyTeam | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(team?.title ?? "");
  const [idea, setIdea] = useState(team?.idea ?? "");
  const [needs, setNeeds] = useState<Skill[]>(team?.needs ?? []);
  const [size, setSize] = useState(team?.size_max ?? 4);
  const [contact, setContact] = useState(team?.contact ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const r = await studentRpc<{ ok: boolean; error?: string }>("student_team_save", { p_id: team?.id ?? null, p_title: title, p_idea: idea, p_needs: needs, p_size: size, p_contact: contact });
      if (!r.ok) return fail(r.error);
      toast(team ? "اتحفظ" : "الفريق اتعمل");
      onSaved();
      onClose();
    } catch {
      fail();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={team ? "تعديل الفريق" : "فريق جديد"}>
      <div className="grid gap-3" data-testid="team-editor">
        <Field label="اسم المشروع">
          <Input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="الفكرة" hint="هتعملوا إيه، ولأنهي مسابقة أو هدف">
          <Textarea value={idea} maxLength={1500} rows={4} onChange={(e) => setIdea(e.target.value)} />
        </Field>
        <Field label="محتاجين مين؟">
          <SkillPicker value={needs} onChange={setNeeds} />
        </Field>
        <Field label="عدد الفريق كله (بيك)">
          <Input type="number" min={2} max={8} value={size} onChange={(e) => setSize(Number(e.target.value))} />
        </Field>
        <Field label="لينك التواصل (اختياري)" hint="جروب واتساب أو ديسكورد — بيظهر للأعضاء بس">
          <Input value={contact} dir="ltr" placeholder="https://chat.whatsapp.com/…" onChange={(e) => setContact(e.target.value)} />
        </Field>
        <Button loading={busy} onClick={() => void save()}>
          {team ? "حفظ" : "انشر الفريق"}
        </Button>
      </div>
    </Sheet>
  );
}

function AskToJoin({ team, onClose, onSent }: { team: OpenTeam; onClose: () => void; onSent: () => void }) {
  const [message, setMessage] = useState("");
  const [skills, setSkills] = useState<Skill[]>(team.match);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const r = await studentRpc<{ ok: boolean; error?: string }>("student_team_request", { p_team: team.id, p_message: message, p_skills: skills });
      if (!r.ok) return fail(r.error);
      toast("الطلب اتبعت");
      onSent();
      onClose();
    } catch {
      fail();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={`انضم لـ ${team.title}`}>
      <div className="grid gap-3" data-testid="team-ask">
        <Field label="رسالة لصاحب الفريق" hint="عرّف بنفسك وقول هتضيف إيه">
          <Textarea value={message} maxLength={500} rows={3} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        <Field label="هتجيب إيه للفريق؟" hint="مهاراتك في المعمل بتظهر لصاحب الفريق متحققة لوحدها">
          <SkillPicker value={skills} onChange={setSkills} />
        </Field>
        <Button loading={busy} onClick={() => void send()}>
          ابعت الطلب
        </Button>
      </div>
    </Sheet>
  );
}

export function StudentTeams() {
  const { data, error, loading, reload } = useAsync(() => studentRpc<Data>("student_teams"), []);
  const [editing, setEditing] = useState<MyTeam | "new" | null>(null);
  const [asking, setAsking] = useState<OpenTeam | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (key: string, fn: string, args: Record<string, unknown>, done: string) => {
    setBusy(key);
    try {
      const r = await studentRpc<{ ok: boolean; error?: string }>(fn, args);
      if (!r.ok) return fail(r.error);
      toast(done);
      reload();
    } catch {
      fail();
    } finally {
      setBusy(null);
    }
  };
  const verified = Object.entries(data?.skills ?? {});
  return (
    <>
      <TopBar title="الفرق والمشاريع" sub="لاقي فريق لمشروعك أو انضم لفريق" back="/me/projects" actions={<Button icon="plus" onClick={() => setEditing("new")}>فريق جديد</Button>} />
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading && !data ? (
        <Loading />
      ) : data ? (
        <div className="grid gap-5" data-testid="teams">
          <Card className="grid gap-2 text-sm">
            <p className="font-semibold text-chalk">مهاراتك المتحققة</p>
            {verified.length ? (
              <div className="flex flex-wrap gap-2">
                {verified.map(([s, n]) => (
                  <Badge key={s} tone="ok">{`${skillName(s)} · ${n} تحدي`}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-fog">عدّي تحديات في معمل BuildX عشان مهاراتك تظهر متحققة للفرق.</p>
            )}
          </Card>

          {data.mine.length > 0 && (
            <section className="grid gap-3">
              <p className="font-semibold text-chalk">فرقك</p>
              {data.mine.map((t) => (
                <Card key={t.id} className="grid gap-3" data-testid={`my-team-${t.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-chalk">{t.title}</p>
                      {t.idea && <p className="mt-1 whitespace-pre-line text-sm text-mist">{t.idea}</p>}
                    </div>
                    <Badge tone={t.status === "open" ? "ok" : t.status === "full" ? "info" : "muted"}>{t.status === "open" ? "مفتوح" : t.status === "full" ? "اكتمل" : "مقفول"}</Badge>
                  </div>
                  {t.closed_reason && <p className="text-sm text-warn">{`قفله فريق BuildX: ${t.closed_reason}`}</p>}
                  <p className="text-sm text-fog">{`الأعضاء (${t.members.length}/${t.size_max}): ${t.members.map((m) => m.name + (m.owner ? " ★" : "")).join("، ")}`}</p>
                  {t.contact && (
                    <a href={t.contact} target="_blank" rel="noopener noreferrer" className="text-sm text-cyan underline" dir="ltr" data-testid="team-contact">
                      {t.contact}
                    </a>
                  )}
                  {t.owner && !!t.requests?.length && (
                    <div className="grid gap-2 border-t border-[var(--line)] pt-3">
                      <p className="text-sm font-semibold text-chalk">{`طلبات الانضمام (${t.requests.length})`}</p>
                      {t.requests.map((r) => (
                        <div key={r.id} className="grid gap-1.5 rounded-xl border border-[var(--line)] p-3" data-testid={`team-request-${r.id}`}>
                          <p className="font-medium text-chalk">{r.name}</p>
                          {r.message && <p className="text-sm text-mist">{r.message}</p>}
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(r.verified).map(([s, n]) => (
                              <Badge key={`v${s}`} tone="ok">{`✓ ${skillName(s)} · ${n}`}</Badge>
                            ))}
                            {r.skills.filter((s) => !r.verified[s]).map((s) => (
                              <Badge key={`c${s}`}>{`${SKILLS[s]} (بيقول)`}</Badge>
                            ))}
                          </div>
                          {r.passport && (
                            <a href={passportUrl(r.passport)} target="_blank" rel="noopener noreferrer" className="text-xs text-cyan underline">
                              جواز المهارات بتاعه
                            </a>
                          )}
                          <div className="flex gap-2">
                            <Button loading={busy === `a${r.id}`} onClick={() => void act(`a${r.id}`, "student_team_answer", { p_request: r.id, p_accept: true }, "اتقبل في الفريق")}>
                              اقبل
                            </Button>
                            <Button variant="ghost" loading={busy === `d${r.id}`} onClick={() => void act(`d${r.id}`, "student_team_answer", { p_request: r.id, p_accept: false }, "اترفض")}>
                              ارفض
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {t.owner && t.status !== "closed" && (
                      <Button variant="secondary" icon="edit" onClick={() => setEditing(t)}>
                        تعديل
                      </Button>
                    )}
                    {t.owner && !t.closed_reason && (
                      <Button variant="ghost" loading={busy === `s${t.id}`} onClick={() => void act(`s${t.id}`, "student_team_status", { p_team: t.id, p_open: t.status === "closed" }, t.status === "closed" ? "الفريق اتفتح" : "الفريق اتقفل")}>
                        {t.status === "closed" ? "افتح الفريق" : "اقفل الفريق"}
                      </Button>
                    )}
                    {!t.owner && (
                      <Button variant="ghost" loading={busy === `l${t.id}`} onClick={() => confirm("تخرج من الفريق؟") && void act(`l${t.id}`, "student_team_leave", { p_team: t.id }, "خرجت من الفريق")}>
                        اخرج من الفريق
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </section>
          )}

          <section className="grid gap-3">
            <p className="font-semibold text-chalk">فرق بتدور على أعضاء</p>
            {data.open.length ? (
              data.open.map((t) => (
                <Card key={t.id} className="grid gap-2" data-testid={`open-team-${t.id}`}>
                  <p className="font-semibold text-chalk">{t.title}</p>
                  {t.idea && <p className="line-clamp-4 whitespace-pre-line text-sm text-mist">{t.idea}</p>}
                  <p className="text-xs text-fog">{`${t.owner}${t.group ? ` · ${t.group}` : ""} · ${t.members}/${t.size_max}`}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {t.needs.map((s) => (
                      <Badge key={s} tone={t.match.includes(s) ? "ok" : "muted"}>
                        {t.match.includes(s) ? `✓ ${SKILLS[s]}` : SKILLS[s]}
                      </Badge>
                    ))}
                  </div>
                  {t.match.length > 0 && <p className="text-xs text-ok">بيدوّروا على حاجة إنت متحقق فيها</p>}
                  <div>
                    {t.request ? (
                      <Badge tone={t.request === "declined" ? "muted" : "info"}>{t.request === "pending" ? "طلبك مستني رد" : t.request === "declined" ? "اترفض" : "اتقبلت"}</Badge>
                    ) : (
                      <Button variant="secondary" onClick={() => setAsking(t)}>
                        اطلب تنضم
                      </Button>
                    )}
                  </div>
                </Card>
              ))
            ) : (
              <Empty icon="users" title="مفيش فرق مفتوحة دلوقتي" body="ابدأ إنت: اعمل فريق لمشروعك وقول محتاج مين." />
            )}
          </section>
        </div>
      ) : null}
      {editing && <TeamEditor team={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
      {asking && <AskToJoin team={asking} onClose={() => setAsking(null)} onSent={reload} />}
    </>
  );
}

/* ─── Staff: every team, close one that breaks the rules ─────────────── */

type StaffTeam = { id: string; title: string; idea: string; needs: Skill[]; size_max: number; status: string; closed_reason: string | null; contact: string | null; created_at: string; owner: string; owner_code: string; group: string; members: string[]; pending: number };

export function StaffTeams() {
  const { data, error, loading, reload } = useAsync(() => rpc<StaffTeam[]>("staff_project_teams").then((r) => r ?? []), []);
  const [closing, setClosing] = useState<StaffTeam | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const close = async () => {
    if (!closing) return;
    setBusy(true);
    try {
      const r = await rpc<{ ok: boolean; error?: string }>("staff_project_team_close", { p_team: closing.id, p_reason: reason });
      if (!r.ok) return toast(r.error === "reason" ? "اكتب السبب" : "حصلت مشكلة", "error");
      toast("الفريق اتقفل وصاحبه اتبلغ");
      setClosing(null);
      setReason("");
      reload();
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <TopBar title="فرق مشاريع الطلبة" sub="الفرق اللي الطلبة عاملينها في التطبيق" />
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading && !data ? (
        <Loading />
      ) : data?.length ? (
        <div className="grid gap-3" data-testid="staff-teams">
          {data.map((t) => (
            <Card key={t.id} className="grid gap-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-chalk">{t.title}</p>
                <Badge tone={t.status === "closed" ? "muted" : "ok"}>{t.status === "open" ? "مفتوح" : t.status === "full" ? "اكتمل" : "مقفول"}</Badge>
              </div>
              {t.idea && <p className="whitespace-pre-line text-sm text-mist">{t.idea}</p>}
              <p className="text-xs text-fog">{`${t.owner} (${t.owner_code})${t.group ? ` · ${t.group}` : ""} · ${t.members.length}/${t.size_max} · ${t.pending} طلب مستني`}</p>
              <p className="text-xs text-fog">{t.members.join("، ")}</p>
              {t.contact && (
                <p className="text-xs text-mist" dir="ltr">
                  {t.contact}
                </p>
              )}
              {t.closed_reason && <p className="text-xs text-warn">{`السبب: ${t.closed_reason}`}</p>}
              {t.status !== "closed" && (
                <div>
                  <Button variant="ghost" onClick={() => setClosing(t)}>
                    اقفل الفريق
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Empty icon="users" title="لسه مفيش فرق" />
      )}
      {closing && (
        <Sheet open onClose={() => setClosing(null)} title={`قفل ${closing.title}`}>
          <div className="grid gap-3">
            <Field label="السبب (صاحب الفريق هيشوفه)">
              <Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Button variant="danger" loading={busy} onClick={() => void close()}>
              اقفل
            </Button>
          </div>
        </Sheet>
      )}
    </>
  );
}
