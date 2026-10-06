import { Lockup } from "@/components/brand/logo";

/** Shown instead of the Command Center until the deployment has a database and a signing secret. */
export function SetupRequired({ missing }: { missing: string[] }) {
  return (
    <main className="mx-auto flex min-h-[100svh] max-w-2xl flex-col justify-center px-6 py-16">
      <Lockup />
      <p className="t-eyebrow mt-12 text-warn">Setup required</p>
      <h1 className="t-headline mt-3 text-3xl text-chalk">Connect the Command Center</h1>
      <p className="mt-4 leading-relaxed text-mist">
        The public website is live using its built-in content. To unlock the Command Center (members, applications, projects, media), add these environment
        variables to your hosting project and redeploy:
      </p>
      <ul className="mt-6 space-y-3">
        {missing.map((m) => (
          <li key={m} className="rounded-xl border border-[var(--line-2)] bg-panel/60 p-4">
            <code className="font-mono text-sm text-cyan">{m}</code>
            <p className="mt-1 text-sm text-fog">
              {m === "DATABASE_URL"
                ? "A PostgreSQL connection string. A free Supabase or Neon database is enough. Tables are created automatically on the next deploy."
                : "A random secret of at least 32 characters (for example from a password manager). Keep it private."}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-sm text-fog">After the redeploy, open /setup to create the owner account. Setup runs only once.</p>
    </main>
  );
}
