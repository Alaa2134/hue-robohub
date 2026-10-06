import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/brand/icons";
import { MemberForm } from "@/components/command/member-form";
import { PageHeader, StatusBadge, relTime } from "@/components/command/ui";
import { requirePage } from "@/server/auth/guard";
import { getMemberForEdit, memberFormOptions } from "@/server/queries/members-admin";

export const metadata: Metadata = { title: "Edit member" };

export default async function EditMemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; converted?: string }> }) {
  await requirePage("members.manage");
  const [{ id }, { saved, converted }] = await Promise.all([params, searchParams]);
  const [m, { tracks, teams }] = await Promise.all([getMemberForEdit(id), memberFormOptions()]);
  if (!m) notFound();

  return (
    <div className="mx-auto max-w-5xl">
      {converted && (
        <p role="status" className="mb-6 flex items-center gap-2 rounded-xl border border-gold/40 bg-gold/[0.07] px-4 py-3 text-sm text-gold">
          <Icon name="users" size={16} />
          Member created from the application — private for now. Add a photo, then switch PUBLIC PROFILE on to publish.
        </p>
      )}
      {saved && (
        <p role="status" className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-ok/30 bg-ok/[0.07] px-4 py-3 text-sm text-[#bdf5dc]">
          <Icon name="check" size={16} />
          {m.publicProfile ? "Member published — the profile is live on the website." : "Member saved. PUBLIC PROFILE is off, so they stay hidden from the website."}
          {m.publicProfile && (
            <Link href={`/team/${m.slug}`} target="_blank" className="underline">
              Open profile ↗
            </Link>
          )}
        </p>
      )}
      <PageHeader
        kicker={
          <Link href="/command/members" className="hover:text-chalk">
            ← Members
          </Link>
        }
        title={m.fullName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={m.publicProfile ? "active" : "inactive"} label={m.publicProfile ? "Public profile" : "Private"} />
            <StatusBadge status={m.status} />
            <span className="text-xs text-fog">Updated {relTime(m.updatedAt)}</span>
          </span>
        }
      />
      <MemberForm
        key={m.updatedAt.toISOString()}
        tracks={tracks}
        teams={teams}
        value={{
          id: m.id,
          slug: m.slug,
          fullName: m.fullName,
          fullNameAr: m.fullNameAr,
          rank: m.rank,
          department: m.department,
          title: m.title,
          trackId: m.trackId,
          teamId: m.teamId,
          academicYear: m.academicYear,
          bio: m.bio,
          skills: m.skills,
          linkedin: m.linkedin,
          github: m.github,
          instagram: m.instagram,
          facebook: m.facebook,
          youtube: m.youtube,
          website: m.website,
          joinedAt: m.joinedAt,
          status: m.status,
          sortOrder: m.sortOrder,
          publicProfile: m.publicProfile,
          phone: m.phone,
          privateEmail: m.privateEmail,
          adminNotes: m.adminNotes,
          photoUrl: m.photoUrl,
          originalUrl: m.originalUrl,
          photoCrop: m.photoCrop,
        }}
      />
    </div>
  );
}
