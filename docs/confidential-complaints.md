# Confidential complaints

Public routes: /ar/complaints/ and /complaints/. Owner-only portal: /app/#/staff/complaints.
The static site calls narrow Supabase RPCs. The table has RLS and no grants to browser roles; a random 128-bit private tracking code is stored only as a hash. Lookup returns status and public reply only. Staff list/update require active owner and existing MFA policy. Owner inbox notification is generic.
No local drafts, public uploads, phone lookup or exports. Infrastructure security logs may still exist. Establish a neutral escalation path for reports about an owner. Decide a retention/deletion policy and review backups before launch. Attachments and independent reviewer assignment are intentionally disabled until a private-storage/reviewer policy is agreed.
Before launch: apply the migration in the linked BuildX Supabase project (zrtfupdnfxxnguznphis), verify anonymous submission, status lookup, denied direct SELECT and rejected non-owner staff calls, plus MFA owner access. Test with synthetic data only. Run typecheck, lint and Playwright; verify deployed routes. Do not merge until migration and access tests have passed.
