# BuildX Management System — initial implementation
Route: /command/bms, using the existing Command Center login and member records.

- Independent appointments in nested units, including competition-only students.
- Owner/admin grant or end appointments; multiple positions per student; optional expiry.
- Scoped team managers assign tasks to an individual or all active members of the selected unit. Watchers are read-only, reviewers can review but not self-review. Scoped appointments do not grant global Lead access.
- Competition application intake, decisions, and optional linkage to an existing competition.
- Per-member delivery, text/link submissions, review, feedback, scores, in-app notifications, audit history.
- Private PostgreSQL namespace (not a Data API); RLS enabled with no browser policies. The server database connection must own the tables or have the appropriate privileged server role. Existing tables and public site are unchanged.

Migration 0005_bms is hand-written and intentionally isolated from the public Drizzle schema; don't run a destructive schema push. Root units are seeded, not actual members or appointments. Deploy to staging with a copy of the current database first. The production migration has not been applied.

## Verification before merge
1. Run npm ci, typecheck, lint and build with the repository's pinned Node version.
2. Apply drizzle migrations to disposable PostgreSQL; verify the namespace isn't accessible from anonymous/authenticated browser roles and verify server queries work.
3. Test owner, supervisor of A, supervisor of B, reviewer, watcher, competition-only member, and unlinked account. Try forged cross-unit IDs, revoked and expired grants, self-review, accepting own application, and submitting another member's task.
4. Confirm legacy applications, complaints, competitions, public pages, attendance and existing task board still work. Existing task-board global permissions are not altered by this patch; BMS is a distinct workflow.
5. Confirm notification delivery, migration and deployment rollback/backup.

Not included yet: automatic distribution, file upload, attendance/evaluation integration, custom permission editor, full reporting, WhatsApp delivery, bulk member import, role definition editor, budgets, certificates, mobile/native UI, archived units or editing existing unit names. Existing member records are not automatically assigned to avoid inventing appointments; confirm member identity migration before rollout.
