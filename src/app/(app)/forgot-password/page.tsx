import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/command/auth-shell";
import { ForgotForm } from "@/components/command/auth-forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPage() {
  return (
    <AuthShell kicker="Account recovery" title="Reset your password" footer={<Link href="/login" className="text-cyan hover:underline">Back to sign in</Link>}>
      <ForgotForm />
    </AuthShell>
  );
}
