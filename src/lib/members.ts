import type { Department, MemberRank } from "./types";

export const RANK_ORDER: MemberRank[] = [
  "founder",
  "team_leader",
  "vice_leader",
  "technical_lead",
  "competition_lead",
  "media",
  "pr",
  "member",
  "trainee",
];

export const RANK_LABEL: Record<MemberRank, string> = {
  founder: "Founder",
  team_leader: "Team Leader",
  vice_leader: "Vice Leader",
  technical_lead: "Technical Lead",
  competition_lead: "Competition Lead",
  media: "Media",
  pr: "Public Relations",
  member: "Member",
  trainee: "Trainee",
};

export const RANK_LABEL_AR: Record<MemberRank, string> = {
  founder: "المؤسس",
  team_leader: "قائد الفريق",
  vice_leader: "نائب القائد",
  technical_lead: "قائد تقني",
  competition_lead: "قائد المنافسات",
  media: "الإعلام",
  pr: "العلاقات العامة",
  member: "عضو",
  trainee: "متدرّب",
};

/** Visual badge tier for member cards. */
export function badgeTier(rank: MemberRank): "founder" | "leader" | "lead" | "member" | "trainee" {
  if (rank === "founder") return "founder";
  if (rank === "team_leader" || rank === "vice_leader") return "leader";
  if (rank === "technical_lead" || rank === "competition_lead") return "lead";
  if (rank === "trainee") return "trainee";
  return "member";
}

export const DEPARTMENT_LABEL: Record<Department, string> = {
  leadership: "Leadership",
  hardware: "Hardware",
  embedded: "Embedded",
  mechanical: "Mechanical",
  software: "Software / ROS",
  competition: "Competition",
  media: "Media",
  pr: "PR",
  events: "Events",
};

export const TECH_DEPARTMENTS: Department[] = ["hardware", "embedded", "mechanical", "software", "competition"];
export const SUPPORT_DEPARTMENTS: Department[] = ["media", "pr", "events"];

export const ACADEMIC_YEARS = [1, 2, 3, 4, 5] as const;
export function yearLabel(y: number | null | undefined) {
  if (!y) return "";
  return ["", "1st year", "2nd year", "3rd year", "4th year", "5th year", "Postgraduate", "Graduate"][y] ?? `Year ${y}`;
}
