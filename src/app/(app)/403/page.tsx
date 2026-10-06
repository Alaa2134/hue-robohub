import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/command/auth-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Access restricted" };

export default function Forbidden() {
  return (
    <AuthShell kicker="ERR · 403" title="Access restricted">
      <p className="text-sm leading-relaxed text-mist">Your account doesn&apos;t have clearance for that area. Ask an admin if you need access.</p>
      <div className="mt-8 flex gap-3">
        <Link href="/command" className="btn btn-primary">
          <span aria-hidden className="btn-sheen" />
          <span>Back to overview</span>
        </Link>
      </div>
    </AuthShell>
  );
}
