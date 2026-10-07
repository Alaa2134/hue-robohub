/** Clip names on their own (no three.js), so the page can refer to them without loading 3D code. */
export const CLIPS = ["Idle", "Walk", "Run", "Wave", "PointLeft", "PointRight", "LookAround", "LookUp", "LookDown", "Think", "Happy", "Celebrate", "Sit", "Jump", "Sleep", "Typing", "Listening", "Dance"] as const;
export type ClipName = (typeof CLIPS)[number];

/** Clips that play once and hand back to a looping pose. */
export const ONE_SHOT: ReadonlySet<ClipName> = new Set(["Wave", "Celebrate", "Jump", "LookAround"]);
