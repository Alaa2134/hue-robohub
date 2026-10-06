import type { Metadata } from "next";
import Link from "next/link";
import { MemberForm } from "@/components/command/member-form";
import { PageHeader } from "@/components/command/ui";
import { requirePage } from "@/server/auth/guard";
import { memberFormOptions } from "@/server/queries/members-admin";

export const metadata: Metadata = { title: "Add member" };

export default async function NewMemberPage() {
  await requirePage("members.manage");
  const { tracks, teams } = await memberFormOptions();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        kicker={<Link href="/command/members" className="hover:text-chalk">← Members</Link>}
        title="Add member"
        description="Upload a photo, drag to position it, fill in the essentials and publish. Members with PUBLIC PROFILE on appear on the website immediately; phone, private email and notes never leave the Command Center."
      />
      <MemberForm value={{ status: "active", rank: "member", sortOrder: 100 }} tracks={tracks} teams={teams} />
    </div>
  );
}
