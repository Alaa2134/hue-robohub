import type { EntityField } from "./entity-form";

type Opt = { id: string; name: string };
const opts = (xs: Opt[]) => xs.map((x) => ({ value: x.id, label: x.name }));

export const COMPETITION_STATUSES = ["planned", "registered", "competing", "completed", "withdrawn"].map((v) => ({ value: v, label: v[0]!.toUpperCase() + v.slice(1) }));

export const competitionFields = (teams: Opt[]): EntityField[] => [
  { kind: "text", name: "name", label: "Competition", required: true, maxLength: 160, wide: true, placeholder: "e.g. Egyptian Robotics Challenge 2026" },
  { kind: "select", name: "status", label: "Status", options: COMPETITION_STATUSES, required: true },
  { kind: "select", name: "teamId", label: "Our team", options: opts(teams), empty: "—" },
  { kind: "text", name: "organizer", label: "Organizer", maxLength: 160 },
  { kind: "text", name: "category", label: "Category / league", maxLength: 80 },
  { kind: "datetime", name: "startsAt", label: "Starts" },
  { kind: "datetime", name: "registrationDeadline", label: "Registration deadline" },
  { kind: "text", name: "location", label: "Location", maxLength: 160 },
  { kind: "url", name: "url", label: "Official page" },
  { kind: "heading", label: "Outcome", hint: "Fill after the event. Record real results only — they appear on team pages." },
  { kind: "text", name: "result", label: "Result", maxLength: 300, placeholder: "e.g. Quarter-finalist, best design award" },
  { kind: "number", name: "rank", label: "Final rank", min: 1, max: 1000 },
  { kind: "textarea", name: "notes", label: "Internal notes", rows: 3 },
];

export const ACHIEVEMENT_KINDS = [
  { value: "win", label: "Win" },
  { value: "ranking", label: "Ranking" },
  { value: "award", label: "Award" },
  { value: "certificate", label: "Certificate" },
  { value: "milestone", label: "Milestone" },
];

export const achievementFields = (o: { teams: Opt[]; competitions: Opt[]; projects: Opt[]; imageUrl?: string | null }): EntityField[] => [
  { kind: "text", name: "title", label: "Achievement", required: true, maxLength: 160, wide: true, placeholder: "e.g. 2nd place — Mini Sumo" },
  { kind: "select", name: "kind", label: "Type", options: ACHIEVEMENT_KINDS, required: true },
  { kind: "date", name: "achievedOn", label: "Date", required: true },
  { kind: "number", name: "rank", label: "Rank / place", min: 1, max: 1000 },
  { kind: "select", name: "competitionId", label: "Competition", options: opts(o.competitions), empty: "—" },
  { kind: "select", name: "teamId", label: "Team", options: opts(o.teams), empty: "—" },
  { kind: "select", name: "projectId", label: "Project", options: opts(o.projects), empty: "—" },
  { kind: "textarea", name: "description", label: "Description", rows: 3 },
  { kind: "image", name: "image", label: "Photo / certificate", currentUrl: o.imageUrl, aspect: "16/9" },
  { kind: "switch", name: "public", label: "Show on the website", hint: "Only verified results. Never inflate placements." },
];

export const SPONSOR_TIERS = [
  { value: "strategic", label: "Strategic partner" },
  { value: "gold", label: "Gold" },
  { value: "silver", label: "Silver" },
  { value: "technical", label: "Technical partner" },
];

export const sponsorFields = (logoUrl?: string | null): EntityField[] => [
  { kind: "text", name: "name", label: "Sponsor", required: true, maxLength: 120 },
  { kind: "select", name: "tier", label: "Tier", options: SPONSOR_TIERS, required: true },
  { kind: "url", name: "website", label: "Website" },
  { kind: "number", name: "sortOrder", label: "Order", min: 0, max: 10000, hint: "Lower shows first within a tier" },
  { kind: "textarea", name: "description", label: "What they support", rows: 2 },
  { kind: "image", name: "logo", label: "Logo", currentUrl: logoUrl, aspect: "3/1", hint: "Transparent PNG or SVG exported as PNG works best." },
  { kind: "switch", name: "active", label: "Show on the website" },
];

export const VIDEO_KINDS = ["hero", "story", "showreel", "recap", "promo", "interview", "reel", "testing"].map((v) => ({ value: v, label: v[0]!.toUpperCase() + v.slice(1) }));

export const videoFields = (o: { teams: Opt[]; projects: Opt[]; posterUrl?: string | null }): EntityField[] => [
  { kind: "text", name: "title", label: "Title", required: true, maxLength: 160, wide: true },
  { kind: "select", name: "provider", label: "Where it's hosted", required: true, options: [
      { value: "youtube", label: "YouTube (free)" },
      { value: "hls", label: "HLS stream (self-hosted .m3u8)" },
      { value: "cloudflare", label: "Cloudflare Stream" },
      { value: "mux", label: "Mux" },
    ] },
  { kind: "select", name: "kind", label: "Type", options: VIDEO_KINDS, required: true },
  { kind: "text", name: "source", label: "Link or id", required: true, wide: true, ltr: true, placeholder: "https://youtu.be/… or https://…/master.m3u8", hint: "YouTube is the cheapest option: paste the normal share link." },
  { kind: "date", name: "recordedOn", label: "Recorded on" },
  { kind: "number", name: "durationSeconds", label: "Length (seconds)", min: 1 },
  { kind: "select", name: "projectId", label: "Project", options: opts(o.projects), empty: "—" },
  { kind: "select", name: "teamId", label: "Team", options: opts(o.teams), empty: "—" },
  { kind: "textarea", name: "description", label: "Description", rows: 2 },
  { kind: "image", name: "poster", label: "Poster (optional)", currentUrl: o.posterUrl, aspect: "16/9", hint: "YouTube videos use their own thumbnail when empty." },
  { kind: "switch", name: "published", label: "Published" },
  { kind: "switch", name: "featured", label: "Featured" },
];

export const teamFields = (o: { members: Opt[]; coverUrl?: string | null; specRows: number }): EntityField[] => [
  { kind: "text", name: "name", label: "Team name", required: true, maxLength: 80 },
  { kind: "text", name: "nameAr", label: "Name in Arabic", maxLength: 80 },
  { kind: "text", name: "discipline", label: "Tagline", required: true, maxLength: 120, placeholder: "Precision • Speed • Control" },
  { kind: "color", name: "accent", label: "Accent colour", required: true },
  { kind: "textarea", name: "summary", label: "Summary", rows: 2 },
  { kind: "textarea", name: "description", label: "Description", rows: 4 },
  { kind: "text", name: "robotName", label: "Robot name", maxLength: 80 },
  { kind: "select", name: "captainId", label: "Captain", options: opts(o.members), empty: "—" },
  { kind: "textarea", name: "robotDescription", label: "Robot description", rows: 3 },
  { kind: "image", name: "cover", label: "Cover image", currentUrl: o.coverUrl, aspect: "16/7" },
  { kind: "number", name: "sortOrder", label: "Order", min: 0, max: 1000 },
  { kind: "switch", name: "published", label: "Show on the website" },
  { kind: "heading", label: "Spec sheet", hint: "Shown as the robot's datasheet. Leave a row empty to remove it." },
  ...Array.from({ length: o.specRows }, (_, i): EntityField[] => [
    { kind: "text", name: `spec.${i}.label`, label: `Spec ${i + 1}`, maxLength: 40, placeholder: i === 0 ? "Weight" : undefined },
    { kind: "text", name: `spec.${i}.value`, label: "Value", maxLength: 80, placeholder: i === 0 ? "3 kg" : undefined },
  ]).flat(),
];
