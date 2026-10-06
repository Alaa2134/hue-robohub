import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/brand/icons";
import { ApplicationDecision } from "@/components/command/application-decision";
import { PageHeader, Panel, StatusBadge, relTime } from "@/components/command/ui";
import { formatZoned, toZonedInput } from "@/lib/zoned";
import { can } from "@/lib/permissions";
import { requirePage } from "@/server/auth/guard";
import { getApplication } from "@/server/queries/applications-admin";

export const metadata: Metadata = { title: "Application" };

const YEAR = (y: number) => (y <= 5 ? `Year ${y}` : y === 6 ? "Postgraduate" : "Graduate");

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-[var(--line)] py-3 last:border-0">
      <dt className="t-eyebrow text-[0.55rem] text-fog">{label}</dt>
      <dd className="text-sm text-mist">{children}</dd>
    </div>
  );
}

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePage("applications.view");
  const { id } = await params;
  const a = await getApplication(id);
  if (!a) notFound();

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        kicker={
          <Link href="/command/applications" className="hover:text-chalk">
            ← Applications
          </Link>
        }
        title={a.fullName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={a.status} />
            <span className="text-xs text-fog">
              Applied {relTime(a.createdAt)}
              {a.decidedAt && a.decidedByName && ` · last decision by ${a.decidedByName} ${relTime(a.decidedAt)}`}
            </span>
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_26rem]">
        <div className="flex flex-col gap-6">
          <Panel title="Applicant">
            <dl className="grid gap-x-8 sm:grid-cols-2">
              <Item label="Email">
                <a href={`mailto:${a.email}`} className="break-all text-cyan hover:underline">
                  {a.email}
                </a>
              </Item>
              <Item label="Phone / WhatsApp">
                <a href={`tel:${a.phone.replace(/[^\d+]/g, "")}`} className="text-cyan hover:underline" dir="ltr">
                  {a.phone}
                </a>
              </Item>
              <Item label="Academic year">{YEAR(a.academicYear)}</Item>
              <Item label="Preferred track">{a.track ? `${a.track.name} (${a.track.code})` : "No preference"}</Item>
              <Item label="Availability">{a.availability}</Item>
              <Item label="Links">
                <span className="flex flex-wrap gap-3">
                  {a.githubUrl && (
                    <a href={a.githubUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-cyan hover:underline">
                      GitHub ↗
                    </a>
                  )}
                  {a.portfolioUrl && (
                    <a href={a.portfolioUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-cyan hover:underline">
                      Portfolio ↗
                    </a>
                  )}
                  {!a.githubUrl && !a.portfolioUrl && "—"}
                </span>
              </Item>
            </dl>
          </Panel>
          {a.skills.length > 0 && (
            <Panel title="Skills">
              <ul className="flex flex-wrap gap-2">
                {a.skills.map((s) => (
                  <li key={s} className="rounded-full border border-[var(--line-2)] px-3 py-1 text-xs text-mist">
                    {s}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel title="Why they want to join">
            <p className="whitespace-pre-line text-sm leading-relaxed text-mist" dir="auto">
              {a.motivation}
            </p>
          </Panel>
          {a.experience && (
            <Panel title="Experience">
              <p className="whitespace-pre-line text-sm leading-relaxed text-mist" dir="auto">
                {a.experience}
              </p>
            </Panel>
          )}
        </div>
        <div className="flex flex-col gap-6 max-lg:order-first lg:sticky lg:top-24 lg:self-start">
          <Panel title="Decision" kicker={a.interviewAt ? `Interview · ${formatZoned(a.interviewAt)}` : undefined}>
            {a.member && (
              <Link href={`/command/members/${a.member.id}`} className="mb-5 flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/[0.07] px-3 py-2.5 text-sm text-gold hover:bg-gold/[0.12]">
                <Icon name="users" size={15} /> Converted — open member record →
              </Link>
            )}
            <ApplicationDecision
              app={{ id: a.id, fullName: a.fullName, email: a.email, phone: a.phone, status: a.status, interviewAt: toZonedInput(a.interviewAt), score: a.score, reviewerNotes: a.reviewerNotes, memberId: a.memberId }}
              canDecide={can(actor.role, "applications.decide")}
              canConvert={can(actor.role, "members.manage")}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}
