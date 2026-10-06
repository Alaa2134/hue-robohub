import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/command/auth-shell";
import { ResetForm } from "@/components/command/auth-forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string; invite?: string }> }) {
  const { token = "", invite } = await searchParams;
  return (
    <AuthShell kicker={invite ? "Welcome to the Command Center" : "Account recovery"} title={invite ? "Set your password" : "Choose a new password"} footer={<Link href="/login" className="text-cyan hover:underline">Back to sign in</Link>}>
      {token ? <ResetForm token={token} /> : <p className="text-sm text-mist">This reset link is missing its token. Request a new one from the sign-in screen.</p>}
    </AuthShell>
  );
}
