import Link from "next/link";
import { Icon, type IconName } from "@/components/brand/icons";
import { cn } from "@/lib/cn";
import type { Department, MemberCard } from "@/lib/types";

type Node = { key: string; label: string; icon: IconName; member?: MemberCard };

function Person({ n, href, vacant, tone = "default" }: { n: Node; href: (p: string) => string; vacant: string; tone?: "lead" | "default" | "support" }) {
  const body = (
    <>
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg border", tone === "lead" ? "border-volt/60 bg-volt/15 text-cyan" : "border-[var(--line-2)] bg-panel/60 text-mist")}>
        <Icon name={n.icon} size={18} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[0.95rem] text-chalk">{n.label}</span>
        <span className={cn("block truncate text-xs", n.member ? "text-mist" : "text-steel")}>{n.member ? n.member.fullName : vacant}</span>
      </span>
    </>
  );
  const cls = cn("relative z-10 flex items-center gap-3 rounded-xl border bg-deep/90 px-4 py-3 backdrop-blur transition-colors", n.member ? "border-[var(--line-2)] hover:border-cyan/60" : "border-dashed border-[var(--line-2)]");
  return n.member ? (
    <Link href={href(`/team/${n.member.slug}`)} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/**
 * Organisation map: leadership → technical leads → support crew. Nodes resolve to the published
 * member holding the role; unfilled roles render as open positions (never invented names).
 */
export function OrgMap({ members, roles, vacant, href }: { members: MemberCard[]; roles: Record<string, string>; vacant: string; href: (p: string) => string }) {
  const byRank = (r: MemberCard["rank"]) => members.find((m) => m.rank === r);
  const lead = (d: Department) => members.find((m) => (m.rank === "technical_lead" || m.rank === "competition_lead") && m.department === d);
  const support = (d: Department) => members.find((m) => m.department === d && ["media", "pr", "team_leader", "vice_leader", "technical_lead", "member"].includes(m.rank));
  const top: Node[] = [
    { key: "team_leader", label: roles.team_leader!, icon: "users", member: byRank("team_leader") ?? byRank("founder") },
    { key: "vice_leader", label: roles.vice_leader!, icon: "users", member: byRank("vice_leader") },
  ];
  const leads: Node[] = (["hardware", "embedded", "mechanical", "software", "competition"] as Department[]).map((d) => ({
    key: d,
    label: roles[d]!,
    icon: ({ hardware: "cpu", embedded: "embedded", mechanical: "mechanical", software: "software", competition: "trophy" } as Record<string, IconName>)[d]!,
    member: lead(d),
  }));
  const crew: Node[] = (["media", "pr", "events"] as Department[]).map((d) => ({ key: d, label: roles[d]!, icon: ({ media: "film", pr: "handshake", events: "calendar" } as Record<string, IconName>)[d]!, member: support(d) }));

  return (
    <div className="relative">
      <div aria-hidden className="grid-lines mask-radial absolute inset-0 opacity-30" />
      <div className="relative flex flex-col items-center gap-0">
        <div className="flex w-full max-w-md flex-col gap-3">
          {top.map((n) => (
            <Person key={n.key} n={n} href={href} vacant={vacant} tone="lead" />
          ))}
        </div>
        <span aria-hidden className="h-8 w-px bg-gradient-to-b from-volt to-[var(--line-2)]" />
        <div className="relative w-full">
          <span aria-hidden className="absolute inset-x-[10%] top-0 hidden h-px bg-[var(--line-2)] lg:block" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:pt-6">
            {leads.map((n) => (
              <div key={n.key} className="relative">
                <span aria-hidden className="absolute -top-6 start-1/2 hidden h-6 w-px bg-[var(--line-2)] lg:block" />
                <Person n={n} href={href} vacant={vacant} />
              </div>
            ))}
          </div>
        </div>
        <span aria-hidden className="h-8 w-px bg-[var(--line-2)]" />
        <div className="grid w-full max-w-4xl gap-3 sm:grid-cols-3">
          {crew.map((n) => (
            <Person key={n.key} n={n} href={href} vacant={vacant} tone="support" />
          ))}
        </div>
      </div>
    </div>
  );
}
