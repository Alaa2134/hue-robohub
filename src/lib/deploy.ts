/**
 * Build-time deployment flags.
 * STATIC_SITE: the public site is exported as plain files (GitHub Pages) — no server, no forms, no Command Center.
 * COMMAND_URL: where the Command Center lives; empty hides the entry points (static builds without a backend).
 */
export const STATIC_SITE = process.env.NEXT_PUBLIC_STATIC_SITE === "1";
export const COMMAND_URL = process.env.NEXT_PUBLIC_COMMAND_URL || (STATIC_SITE ? "" : "/command");
/** BuildX App (students & trainers PWA). A plain link: it is a separate root layout. */
export const APP_HREF = STATIC_SITE ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/app/` : "/app";
