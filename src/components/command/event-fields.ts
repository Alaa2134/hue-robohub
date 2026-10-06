import type { EntityField } from "./entity-form";

export const EVENT_TYPES = [
  { value: "workshop", label: "Workshop" },
  { value: "training", label: "Training" },
  { value: "bootcamp", label: "Bootcamp session" },
  { value: "meeting", label: "Meeting" },
  { value: "competition", label: "Competition" },
  { value: "presentation", label: "Presentation" },
  { value: "deadline", label: "Deadline" },
  { value: "maintenance", label: "Lab maintenance" },
] as const;

export const EVENT_COLOR: Record<string, string> = {
  workshop: "#38dcff",
  training: "#5a90ff",
  bootcamp: "#9b6bff",
  meeting: "#8fa3c0",
  competition: "#ff3b4e",
  presentation: "#e8b45c",
  deadline: "#ff8a1f",
  maintenance: "#64748b",
};

export function eventFields(teams: { id: string; name: string }[], coverUrl?: string | null): EntityField[] {
  return [
    { kind: "text", name: "title", label: "Title", required: true, maxLength: 140, wide: true },
    { kind: "select", name: "type", label: "Type", options: EVENT_TYPES, required: true },
    { kind: "text", name: "location", label: "Location", placeholder: "e.g. Robotics Lab, Building B" },
    { kind: "datetime", name: "startsAt", label: "Starts", required: true },
    { kind: "datetime", name: "endsAt", label: "Ends" },
    { kind: "switch", name: "allDay", label: "All day" },
    { kind: "select", name: "teamId", label: "Team", options: teams.map((t) => ({ value: t.id, label: t.name })), empty: "Everyone" },
    { kind: "textarea", name: "description", label: "Description", rows: 4 },
    { kind: "heading", label: "Website", hint: "Public events appear on the Events page with an add-to-calendar file." },
    { kind: "switch", name: "public", label: "Show on the website" },
    { kind: "url", name: "registrationUrl", label: "Registration link", placeholder: "https://forms.gle/…" },
    { kind: "text", name: "ctaLabel", label: "Button label", placeholder: "Register", maxLength: 40 },
    { kind: "image", name: "cover", label: "Cover image", currentUrl: coverUrl, aspect: "16/7" },
  ];
}
