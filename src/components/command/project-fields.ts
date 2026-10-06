import type { EntityField } from "./entity-form";

export const PROJECT_STATUSES = [
  { value: "idea", label: "Idea" },
  { value: "research", label: "Research" },
  { value: "design", label: "Design" },
  { value: "prototype", label: "Prototype" },
  { value: "testing", label: "Testing" },
  { value: "competition_ready", label: "Competition ready" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
] as const;

type Opt = { id: string; name: string };

export function projectFields(o: { tracks: Opt[]; teams: Opt[]; members: Opt[]; heroUrl?: string | null; lead: boolean; full: boolean }): EntityField[] {
  const base: EntityField[] = [
    { kind: "text", name: "title", label: "Project name", required: true, maxLength: 140, wide: true },
    { kind: "textarea", name: "summary", label: "One-paragraph summary", rows: 2, hint: "Shown on project cards." },
    { kind: "select", name: "status", label: "Stage", options: PROJECT_STATUSES, required: true },
    { kind: "number", name: "progress", label: "Progress %", min: 0, max: 100, step: 5 },
    { kind: "select", name: "trackId", label: "Track", options: o.tracks.map((t) => ({ value: t.id, label: t.name })), empty: "—" },
    { kind: "select", name: "teamId", label: "Competition team", options: o.teams.map((t) => ({ value: t.id, label: t.name })), empty: "—" },
    { kind: "select", name: "managerId", label: "Project manager", options: o.members.map((m) => ({ value: m.id, label: m.name })), empty: "—" },
    { kind: "number", name: "budget", label: "Budget (EGP)", min: 0, step: "any" },
  ];
  if (!o.full) return base;
  return [
    ...base,
    { kind: "date", name: "startDate", label: "Start date" },
    { kind: "date", name: "endDate", label: "Target date" },
    { kind: "tags", name: "technologies", label: "Technologies", placeholder: "STM32, ROS 2, Fusion 360", wide: true },
    { kind: "url", name: "githubUrl", label: "GitHub" },
    { kind: "url", name: "demoUrl", label: "Demo video / link" },
    { kind: "image", name: "hero", label: "Hero image", currentUrl: o.heroUrl, aspect: "16/7" },
    { kind: "heading", label: "Case study", hint: "Shown on the public project page — write it for visitors and future members." },
    { kind: "textarea", name: "problem", label: "Problem", rows: 3 },
    { kind: "textarea", name: "solution", label: "Solution", rows: 3 },
    { kind: "textarea", name: "electronics", label: "Electronics", rows: 3 },
    { kind: "textarea", name: "mechanical", label: "Mechanical", rows: 3 },
    { kind: "textarea", name: "software", label: "Software", rows: 3 },
    { kind: "textarea", name: "challenges", label: "Challenges", rows: 3 },
    { kind: "textarea", name: "testing", label: "Testing", rows: 3 },
    { kind: "textarea", name: "results", label: "Results", rows: 3 },
    { kind: "heading", label: "Internal" },
    { kind: "textarea", name: "notes", label: "Private notes", rows: 3, hint: "Never shown on the website." },
    ...(o.lead
      ? ([
          { kind: "heading", label: "Website" },
          { kind: "switch", name: "published", label: "Published", hint: "Show this project on the website." },
          { kind: "switch", name: "featured", label: "Featured", hint: "Pin to the homepage and top of the projects page." },
        ] as EntityField[])
      : []),
  ];
}
