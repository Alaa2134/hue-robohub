# BuildX HUE — website & BuildX App

Student Innovation & Robotics Community, Horus University – Egypt. Live at **https://buildxhue.com**.

- **Website:** English at the root, Arabic under `/ar/`. It covers the tracks, competitions, events and the roadmap, has the application form at `/join`, and shows team portfolios at `/team`.
- **BuildX App** (`/app/`): a phone-first web app for the training team and students. It handles barcode attendance, course content, quizzes, join applications and team portfolios.

## How it's built

- **Next.js** (see `AGENTS.md`). The public site is exported as plain static files by `scripts/build-static.mjs`, with no server and no database.
- **Supabase** (project `hue-robohub`) holds everything that changes: the app's data, applications and portfolios. The browser only ever gets the publishable key, and Row Level Security in `supabase/migrations/` controls access.
- **GitHub Pages** serves the `gh-pages` branch. The `CNAME` file binds it to `buildxhue.com`.

## Deploying

Every merge into `main` runs `.github/workflows/deploy.yml`. That workflow type-checks and lints the code, builds the site and publishes it to `gh-pages`. Every pull request runs the same checks without publishing (`ci.yml`).

To build locally:

```bash
npm ci
CNAME=buildxhue.com SITE_URL=https://buildxhue.com node scripts/build-static.mjs   # → out-static/
```

## Database changes

Migrations live in `supabase/migrations/` and are applied to the Supabase project in filename order. Visitors can only:
- read published content;
- submit an application through `public.submit_application`.

Everything else needs a staff account.
