import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/command/auth-shell";
import { SetupForm } from "@/components/command/auth-forms";
import { isSetupComplete } from "@/server/services/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "First-time setup" };

/** One-time owner bootstrap. Once any account exists this route permanently redirects to sign-in. */
export default async function SetupPage() {
  if (await isSetupComplete()) redirect("/login");
  return (
    <AuthShell kicker="First-time setup · runs once" title="Create the owner account">
      <p className="-mt-3 mb-6 text-sm leading-relaxed text-mist">This account controls roles, settings and every other account. Setup locks itself permanently after this step.</p>
      <SetupForm />
    </AuthShell>
  );
}
