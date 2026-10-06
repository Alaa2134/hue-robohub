# BuildX HUE — Design System (v2)

Art direction: **mission-grade cinematic engineering**. Deep navy-black field, electric-blue signal, cyan HUD highlights, chrome neutrals, motorsport accents for competition teams. Every page is led by rendered key art (Blender/Cycles) — never stock, never placeholders, never fake data.

## Tokens (`src/app/globals.css`)

| Token | Value | Use |
|---|---|---|
| `void` `abyss` `deep` | `#010309` `#03070f` `#060c18` | page backgrounds (void = default, abyss = alternate bands) |
| `panel` `panel-2` `rim` `steel` | `#0a1324` `#0e1a30` `#16243d` `#2a3a56` | surfaces, borders, inactive |
| `fog` `mist` `frost` `chalk` | `#6c7d99` `#9fb0c9` `#d9e3f2` `#f3f7fd` | text: meta → body → strong → headline |
| `volt` (`-hi` `-lo`) | `#2b6dff` | primary action, brand blue ("HUB", RH axis) |
| `cyan` / `ice` | `#38dcff` | HUD highlights, focus, live indicators |
| `gold` | `#e8b45c` | Challenge Day, achievements, founder badge |
| `ok` `warn` `danger` | | status |
| Team colours | LF `#2F7BFF` · Sumo `#FF3B4E` · Sprint `#FF8A1F` · Autonomous `#2ED47A` · Innovation `#9B6BFF` | competition teams (stored in DB `competition_teams.accent`) |
| Track worlds | EMB `#38DCFF` · ROB `#5A90FF` · MEC `#E8B45C` · SWR `#3DF5C8` · CMP `#FF3B4E` | `src/lib/worlds.ts` |

CSS vars: `--line` / `--line-2` hairlines, `--chrome` gradient, `--header-h`.

## Type

- `t-display` — Saira expanded, uppercase, 0.92 line-height. Page titles, hero lines. Size with `text-[clamp(...)]`.
- `t-headline` / `t-title` — Saira, mixed case. Card titles, section sub-heads.
- `t-eyebrow` — JetBrains Mono, 0.22em tracking, uppercase. Labels, kickers, meta.
- `t-label` — Saira small caps-style labels (nav, buttons).
- `t-data` — mono + tabular numbers (telemetry, counters, serials).
- Body: Inter (`text-mist` for paragraphs, `text-frost` for emphasis).
- Arabic (`dir="rtl"`) automatically switches display type to Noto Kufi and body to IBM Plex Sans Arabic. Always use logical utilities: `ms-/me-/ps-/pe-/start-/end-`, `rtl:` variants for directional icons (`rtl:-scale-x-100` on arrows).
- Gradient text: `text-chrome`, `text-volt` (put the class on the element that directly contains the text — not on a parent of an animated span).

## Surfaces & effects

- `frame` — machined glass card with gradient edge light. Set `style={{ "--edge": 0..1 }}` to intensify. Use `!rounded-[18px]` for large cards.
- `glass` — blurred translucent panel. `grid-lines` — engineering grid. `mask-radial` / `mask-b` / `mask-t` / `mask-x`.
- `corners` — HUD corner brackets. `chamfer`, `chamfer-tr`, `chamfer-bl` — 45° cuts that echo the RH mark (`--c` sets size).
- `grain` (on a relative container: animated film grain), `scanlines`, `livery` (team stripes, set `--a`), `carbon`, `speedlines`.
- `rail` — horizontal snap carousel for phones (`-mx-5 px-5` to bleed to the edges).
- Buttons: use `<ButtonLink>` / `<Button>` (`variant="primary" | "outline" | "gold"`, `size="sm" | "md" | "lg"`, `arrow`, `icon`). Raw classes: `btn btn-primary btn-sm btn-lg btn-gold btn-icon`.

## Motion

- `<Reveal delay>` (fade-up on enter), `<MaskText text>` (word mask reveal for headings), `<ClipReveal>`.
- `.enter` / `.enter-mask` with `style={{"--d":"300ms"}}` for above-the-fold choreography (plays before hydration).
- `<Tilt max>` — 3D tilt + pointer light on cards (mouse only). `<Parallax>`, `<Magnetic>`, `<Counter>`.
- Everything respects `prefers-reduced-motion`. Never animate layout; animate transform/opacity/clip-path.

## Components

- Site chrome (layout): `Header`, `MenuSheet`, `SearchDialog` (⌘K), `TabBar` (phones), `Footer` (with recruitment band).
- `PageHero` — every secondary page starts with it: `eyebrow`, `title`, `body`, `image` (key art or CMS image), `accent`, `crumbs`, `actions`, `meta` (HUD stats).
- `SectionHead` — indexed eyebrow + masked display title + body + action.
- `Picture` — `<picture>` with AVIF/WebP srcsets, blur placeholder, focal point. Accepts key art (`art("name", ...fallbacks)`) or CMS `PublicImage`.
- `MemberCard` (ID-card styled, rank badge, holographic sheen), `Monogram`, `ProjectCard`, `EmptyState`, `Chip`.
- Media: `FilmLauncher` / `FilmModal` / `FilmPlayer` / `AmbientVideo` (HLS via hls.js, native on Safari).
- Home: `Hero`, `Story`, `TrackPanels`, `Garage`, `Assembly` (bootcamp build sequence), `WorkSection`, `MediaWall`, `SeasonSection`.

## Key art library

`art(...names)` (`src/lib/media-library.ts`) returns the first rendered entry. Names: `hero`, `track_embedded`, `track_robotics`, `track_mechanical`, `track_software`, `arena`, `team_line_follower`, `team_sumo`, `team_sprint`, `team_autonomous`, `team_innovation`, `bootcamp_1`…`bootcamp_7`, `recruit`, `recruit_tall`, `trophy`, `idea`, `showcase`, `team_env`, `macro`, `logo3d_wide`, `logo3d_square`. Always pass a fallback chain ending in `"hero"`. Helpers: `trackWorld(slug)`, `teamArt(slug)` in `src/lib/worlds.ts`.

## Rules

1. **Honesty.** No fake members, projects, results, sponsors, numbers or testimonials. Empty database → designed `EmptyState`. Stats only from the database.
2. **No endorsement claims.** BuildX HUE is a student-led community at Horus University; never imply official university publication or approval.
3. **Privacy.** Public pages never render phone numbers, private emails, attendance, internal/admin notes. Members appear only when `public_profile = true` (queries already enforce this).
4. **Mobile = app.** Design at 390×844 first: thumb-reachable actions, `rail` carousels, 44px targets, `100svh` heroes, safe areas. The tab bar occupies the bottom 68px + safe area.
5. **Performance.** Server components by default; client islands only for interaction. Images through `Picture` with honest `sizes`. No layout shift.
6. **Accessibility.** Semantic landmarks, one `h1` per page, labelled controls, visible focus, keyboard support for every interactive pattern, `aria-current` on active nav.
