export function formatDate(iso: string | null | undefined, locale = "en", opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", { timeZone: "Africa/Cairo", ...opts }).format(d);
}

export function formatTime(iso: string, locale = "en") {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Cairo" }).format(new Date(iso));
}

export function dateParts(iso: string, locale = "en") {
  const d = new Date(iso);
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", { timeZone: "Africa/Cairo", ...o }).format(d);
  return { day: f({ day: "2-digit" }), month: f({ month: "short" }), year: f({ year: "numeric" }), weekday: f({ weekday: "short" }) };
}

export function money(n: number | string | null | undefined, currency = "EGP") {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return new Intl.NumberFormat("en-EG", { style: "currency", currency, maximumFractionDigits: 2 }).format(v);
}

export const PROJECT_STATUS_LABEL: Record<string, string> = {
  idea: "Idea",
  research: "Research",
  design: "Design",
  prototype: "Prototype",
  testing: "Testing",
  competition_ready: "Competition ready",
  completed: "Completed",
  archived: "Archived",
};

export const EVENT_TYPE_LABEL: Record<string, string> = {
  meeting: "Meeting",
  workshop: "Workshop",
  training: "Training",
  competition: "Competition",
  deadline: "Deadline",
  presentation: "Presentation",
  maintenance: "Maintenance",
  bootcamp: "Bootcamp",
};

export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

export const GALLERY_CATEGORY_LABEL: Record<string, string> = {
  workshop: "Workshop",
  competition: "Competition",
  robot_build: "Robot build",
  behind_the_scenes: "Behind the scenes",
  events: "Events",
  awards: "Awards",
};
