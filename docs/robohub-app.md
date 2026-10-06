# BuildX App

Arabic, phone-first app at `/app/` for students and the training team. It is a static PWA (works on GitHub Pages) backed by the Supabase project `zrtfupdnfxxnguznphis` (free tier).

## What it does

- **Attendance by barcode.** Create a session, then scan each student's ID card with the phone camera, or type the number, or use a USB/Bluetooth barcode scanner (it types into the code box). Late after N minutes, excused/absent fixes, CSV sheet export. Scans made without internet are kept on the phone and sent automatically when the connection returns.
- **Students.** Add students one at a time or paste many at once (`code, name` per line, straight from Excel). If a card's barcode differs from the typed number, scanning it once offers to link it. Each student gets a 6-digit PIN for the app; PIN slips print with a real QR code that opens the student login.
- **Content.** Upload files (PDF, slides, images, video, code; 50 MB each) or add links, for everyone or one group.
- **Quizzes.** Single choice, multiple answers, true/false, short answer (Arabic-aware matching). Time limit, open/close window, attempts, shuffling. Grading runs in the database, and correct answers reach a student only after their last attempt or after the quiz closes.
- **Team.** Roles: owner, admin, lead (trainer). An activity log records sensitive actions.

## First run

1. Open `/app/` and choose **إعداد أول مرة**.
2. Enter your name, email, a password (10+ characters) and the one-time setup code. The code stops working after the first use.

## Security model

- Staff sign in with Supabase Auth. Every table has row-level security, and the `anon` role has no table access.
- Students never get table access. They call `student_*` functions with an opaque session token. Only the token's SHA-256 is stored, and PINs are stored as bcrypt hashes in the non-exposed `private` schema. Five wrong PINs lock a code for 15 minutes, doubling after that.
- Staff accounts are created by the `staff-admin` edge function (`supabase/functions/staff-admin`). It runs with the project's secret key and re-checks the caller's role on every action.
- Uploaded files live in a public bucket under random paths. Listing files and uploading are staff-only.

## Recommended Supabase settings

- Authentication → Sign In / Providers → turn off **Allow new users to sign up** (staff accounts come from the app).
- Free projects pause after 7 days with no activity and must be restored from the Supabase dashboard (**Restore project**). Weekly use of the app keeps the project active.

## Development

- `npm run dev` then open `http://localhost:3000/app`. Without overrides, the app talks to the hosted project.
- Point it elsewhere with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_KEY`.
- The schema lives in `supabase/migrations/20261004110655_robohub_app.sql` (the consolidated end state of the applied migrations).
- The static export (`scripts/build-static.mjs`) includes the app. The ZXing WebAssembly reader is copied to `public/app/` by `scripts/app-assets.mjs`.
