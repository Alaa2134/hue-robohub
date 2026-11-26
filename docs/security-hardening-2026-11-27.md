# Security hardening — 2026-11-27
- Anonymous execution removed from 15 staff-only RPCs; authenticated callers still have existing authorization checks.
- Student sessions: 30-day non-extending expiry; existing sessions capped at 30 days without immediately logging anyone out. Student local cache clears on logout/account change, is keyed by arguments and expires after 24 hours. Bearer tokens remain in localStorage for the static/PWA architecture; migration to secure HttpOnly cookies needs server architecture work.
- Private BMS backup now includes 12 BMS tables, not physical file contents; off-site encrypted copies and restore rehearsal still needed.
- 14 missing BMS foreign key indexes added. Archived teams reject writes except edit/revoke; leave reasons restricted to manager and student.
- UI prevents switching team while an upload/mutation is pending; clears stale data on switching and reports errors. Decimal budget and expenses allowed.
- Dependency audit workflow scans npm production dependencies on PR, main and weekly; review output, do not blindly auto-upgrade.
- MFA rollout: existing global setting must remain off until every active administrator enrolls and recovery is verified. At initial audit only 1/17 active staff enrolled. Enable in existing Security screen once verified; no lockout introduced by this patch. Leaked-password checks require Supabase Auth dashboard/plan support.
- Remaining: test role isolation with synthetic accounts, malware scanning, real off-site restore drill, external DDoS/WAF policies, full XSS and dependency review, production logs analysis. No claim of complete pentest.
