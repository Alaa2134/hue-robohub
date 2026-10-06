/** Serializable view models shared between server queries and client components. Dates are ISO strings. */

export type PublicImage = {
  src: string;
  avif: string;
  webp: string;
  width: number;
  height: number;
  placeholder: string | null;
  color: string | null;
  alt: string;
};

export type MemberRank =
  | "founder"
  | "team_leader"
  | "vice_leader"
  | "technical_lead"
  | "competition_lead"
  | "media"
  | "pr"
  | "member"
  | "trainee";

export type Department =
  | "leadership"
  | "hardware"
  | "embedded"
  | "mechanical"
  | "software"
  | "competition"
  | "media"
  | "pr"
  | "events";

export type MemberCard = {
  id: string;
  slug: string;
  fullName: string;
  rank: MemberRank;
  department: Department | null;
  title: string | null;
  track: { slug: string; name: string; code: string } | null;
  team: { slug: string; name: string; accent: string } | null;
  academicYear: number | null;
  photo: PublicImage | null;
  skills: string[];
};

export type VideoSource = {
  id: string;
  title: string;
  description: string;
  kind: string;
  provider: "mux" | "cloudflare" | "hls" | "youtube";
  hls: string | null;
  youtubeId: string | null;
  poster: string | null;
  durationSeconds: number | null;
};
