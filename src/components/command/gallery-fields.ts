import type { EntityField } from "./entity-form";

export const GALLERY_CATEGORIES = [
  { value: "workshop", label: "Workshop" },
  { value: "competition", label: "Competition" },
  { value: "robot_build", label: "Robot build" },
  { value: "behind_the_scenes", label: "Behind the scenes" },
  { value: "events", label: "Events" },
  { value: "awards", label: "Awards" },
] as const;

export const albumFields: EntityField[] = [
  { kind: "text", name: "title", label: "Album title", required: true, maxLength: 120 },
  { kind: "select", name: "category", label: "Category", options: GALLERY_CATEGORIES, required: true },
  { kind: "date", name: "takenOn", label: "Date" },
  { kind: "switch", name: "published", label: "Published", hint: "Show this album on the website gallery." },
  { kind: "textarea", name: "description", label: "Description", rows: 3 },
];
