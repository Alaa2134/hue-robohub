import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/command/auth-shell";
import { LoginForm } from "@/components/command/auth-forms";
import { getActor } from "@/server/auth/guard";
import { isSetupComplete } from "@/server/services/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await isSetupComplete())) redirect("/setup");
  const sp = await searchParams;
  if (await getActor()) redirect("/command");
  const notice = sp.reset ? "Password updated. Sign in with your new password." : sp.signed_out ? "You have been signed out." : undefined;
  return (
    <AuthShell kicker="Secure access" title="Sign in to Command Center" footer={<>New member? Accounts are created by an admin. <Link href="/join" className="text-cyan hover:underline">Apply to join</Link></>}>
      <LoginForm next={sp.next} notice={notice} />
    </AuthShell>
  );
}
