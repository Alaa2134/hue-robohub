/**
 * Visual worlds. Every track and competition team owns an accent, a render (with fallbacks while the
 * library renders) and a background motif, so each discipline reads as its own place.
 */
export type Motif = "pcb" | "rover" | "blueprint" | "pointcloud" | "race";

export const TRACK_WORLD: Record<string, { accent: string; art: string[]; motif: Motif }> = {
  "robotics-embedded": { accent: "#3D8BFF", art: ["track_robotics", "track_embedded", "hero"], motif: "rover" },
  "ai-ml": { accent: "#38DCFF", art: ["team_autonomous", "track_software", "hero"], motif: "pointcloud" },
  software: { accent: "#7AA7FF", art: ["track_software", "hero"], motif: "pointcloud" },
  iot: { accent: "#3DF5C8", art: ["track_embedded", "macro", "hero"], motif: "pcb" },
  "3d-design": { accent: "#E8B45C", art: ["track_mechanical", "bootcamp_5", "hero"], motif: "blueprint" },
  "media-design": { accent: "#FF6FAE", art: ["bootcamp_7", "team_innovation", "hero"], motif: "race" },
  business: { accent: "#FFB547", art: ["team_innovation", "hero"], motif: "blueprint" },
};

export function trackWorld(slug: string) {
  return TRACK_WORLD[slug] ?? { accent: "#5A90FF", art: ["hero"], motif: "rover" as Motif };
}

const TEAM_ART: Record<string, string[]> = {
  "line-follower": ["team_line_follower", "team_sprint"],
  sumo: ["team_sumo"],
  "iot-challenges": ["track_embedded"],
  "ai-hackathons": ["team_autonomous", "track_software"],
  programming: ["track_software"],
  "green-innovation": ["team_innovation"],
};

export function teamArt(slug: string) {
  return [...(TEAM_ART[slug] ?? [`team_${slug.replace(/-/g, "_")}`]), "arena", "hero"];
}
