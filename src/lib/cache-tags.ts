/** Cache tags for public content. Mutations expire exactly the tags they affect. */
export const TAGS = {
  settings: "settings",
  stats: "stats",
  members: "members",
  tracks: "tracks",
  teams: "teams",
  projects: "projects",
  events: "events",
  achievements: "achievements",
  competitions: "competitions",
  bootcamp: "bootcamp",
  gallery: "gallery",
  videos: "videos",
  sponsors: "sponsors",
  articles: "articles",
  resources: "resources",
} as const;
export type Tag = (typeof TAGS)[keyof typeof TAGS];
