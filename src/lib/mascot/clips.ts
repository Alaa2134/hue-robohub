/**
 * The mascot's animation clips, written as small functions of time and sampled into keyframes.
 * Every clip starts and ends near the rest pose, so the runtime can cross-fade between any two of them
 * (Idle → Walk → Point → Idle) without pops. Looping clips repeat seamlessly.
 */
import * as THREE from "three";
import { NODES } from "./model";

import type { ClipName } from "./clip-names";

export { CLIPS, ONE_SHOT, type ClipName } from "./clip-names";

type Pose = { rot?: [number, number, number]; pos?: [number, number, number]; scale?: [number, number, number] };
type Rig = Partial<Record<"hips" | "head" | "armL" | "armR" | "legL" | "legR", Pose>>;

const REST: Required<Record<keyof Rig, Required<Pose>>> = {
  hips: { rot: [0, 0, 0], pos: [0, 0, 0], scale: [1, 1, 1] },
  head: { rot: [0, 0, 0], pos: [0, 0.7, 0], scale: [1, 1, 1] },
  armL: { rot: [0, 0, -0.18], pos: [-0.33, 0.47, 0.06], scale: [1, 1, 1] },
  armR: { rot: [0, 0, 0.18], pos: [0.33, 0.47, 0.06], scale: [1, 1, 1] },
  legL: { rot: [0, 0, 0], pos: [-0.15, 0.13, 0.03], scale: [1, 1, 1] },
  legR: { rot: [0, 0, 0], pos: [0.15, 0.13, 0.03], scale: [1, 1, 1] },
};

const NODE_OF: Record<keyof Rig, string> = { hips: NODES.hips, head: NODES.head, armL: NODES.armL, armR: NODES.armR, legL: NODES.legL, legR: NODES.legR };

const TAU = Math.PI * 2;
const sin = (t: number, period: number, phase = 0) => Math.sin((t / period) * TAU + phase);
/** 0 → 1 → 0 envelope over [0, d] with eased edges of length e. */
const env = (t: number, d: number, e = 0.25) => Math.min(ease(t / e), ease((d - t) / e));
function ease(x: number) {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}
const add = (a: [number, number, number], b?: [number, number, number], k = 1): [number, number, number] => (b ? [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k] : a);

/** Offsets from the rest pose, as a function of time. */
type Motion = (t: number) => Rig;

function sample(name: ClipName, duration: number, motion: Motion, fps = 30): THREE.AnimationClip {
  const frames = Math.max(2, Math.round(duration * fps) + 1);
  const times = Array.from({ length: frames }, (_, i) => (i / (frames - 1)) * duration);
  const tracks: THREE.KeyframeTrack[] = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const part of Object.keys(REST) as (keyof Rig)[]) {
    const rest = REST[part];
    const rots: number[] = [];
    const poss: number[] = [];
    const scales: number[] = [];
    let moves = { rot: false, pos: false, scale: false };
    for (const t of times) {
      const p = motion(t)[part] ?? {};
      moves = { rot: moves.rot || !!p.rot, pos: moves.pos || !!p.pos, scale: moves.scale || !!p.scale };
      q.setFromEuler(e.set(...add(rest.rot, p.rot)));
      rots.push(q.x, q.y, q.z, q.w);
      poss.push(...add(rest.pos, p.pos));
      const s = p.scale ?? [0, 0, 0];
      scales.push(rest.scale[0] + s[0], rest.scale[1] + s[1], rest.scale[2] + s[2]);
    }
    // Every clip keys rotation for every part, so blending always has a target (no drift).
    tracks.push(new THREE.QuaternionKeyframeTrack(`${NODE_OF[part]}.quaternion`, times, rots));
    if (moves.pos || part === "hips") tracks.push(new THREE.VectorKeyframeTrack(`${NODE_OF[part]}.position`, times, poss));
    if (moves.scale || part === "hips") tracks.push(new THREE.VectorKeyframeTrack(`${NODE_OF[part]}.scale`, times, scales));
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

const breathe = (t: number, period = 3, amount = 0.014): Pose => ({ scale: [amount * 0.4 * sin(t, period), amount * sin(t, period), amount * 0.4 * sin(t, period)] });

export function buildClips(): THREE.AnimationClip[] {
  const out: THREE.AnimationClip[] = [];

  // Idle: breathing, a slow head drift, arms that sway a little.
  out.push(
    sample("Idle", 6, (t) => ({
      hips: { ...breathe(t, 3) },
      head: { rot: [0.03 * sin(t, 6), 0.06 * sin(t, 6, 1), 0.035 * sin(t, 3, 0.5)] },
      armL: { rot: [0.04 * sin(t, 3), 0, -0.03 * sin(t, 3, 0.4)] },
      armR: { rot: [0.04 * sin(t, 3, 0.6), 0, 0.03 * sin(t, 3, 0.9)] },
    })),
  );

  // Walk: a soft waddle.
  const walk = (period: number, k: number): Motion => (t) => {
    const s = sin(t, period);
    const bob = Math.abs(sin(t, period));
    return {
      hips: { pos: [0, 0.028 * k * bob, 0], rot: [0.06 * k, 0.05 * k * s, 0.07 * k * s], scale: [0, -0.02 * k * (1 - bob), 0] },
      head: { rot: [-0.03 * k, -0.04 * k * s, -0.05 * k * s] },
      legL: { rot: [0.6 * k * s, 0, 0], pos: [0, 0.03 * k * Math.max(0, s), 0] },
      legR: { rot: [-0.6 * k * s, 0, 0], pos: [0, 0.03 * k * Math.max(0, -s), 0] },
      armL: { rot: [-0.45 * k * s, 0, -0.08 * k] },
      armR: { rot: [0.45 * k * s, 0, 0.08 * k] },
    };
  };
  out.push(sample("Walk", 0.9, walk(0.9, 1)));
  out.push(
    sample("Run", 0.56, (t) => {
      const r = walk(0.56, 1.5)(t);
      return { ...r, hips: { ...r.hips, rot: [0.18, (r.hips!.rot ?? [0, 0, 0])[1], (r.hips!.rot ?? [0, 0, 0])[2]] }, armL: { rot: [-0.9 + 0.6 * sin(t, 0.56), 0, -0.2] }, armR: { rot: [-0.9 - 0.6 * sin(t, 0.56), 0, 0.2] } };
    }),
  );

  // Wave with the right hand.
  out.push(
    sample("Wave", 2.2, (t) => {
      const k = env(t, 2.2, 0.35);
      return {
        hips: { rot: [0, 0, -0.05 * k], ...breathe(t) },
        head: { rot: [0, 0.08 * k, -0.1 * k] },
        armR: { rot: [-0.25 * k, 0, (2.35 + 0.32 * sin(t, 0.55)) * k] },
        armL: { rot: [0, 0, 0.04 * k] },
      };
    }),
  );

  // Point to the left / right side of the screen (held while the guide talks).
  const point = (side: -1 | 1): Motion => (t) => ({
    hips: { rot: [0, side * 0.16, side * -0.04], ...breathe(t) },
    head: { rot: [0.04, side * 0.2 + 0.03 * sin(t, 3), side * 0.05] },
    [side < 0 ? "armL" : "armR"]: { rot: [-0.3, side * 0.25, side * (1.32 + 0.04 * sin(t, 1.5))] },
    [side < 0 ? "armR" : "armL"]: { rot: [0.05, 0, side * 0.05] },
  });
  out.push(sample("PointLeft", 3, point(-1)));
  out.push(sample("PointRight", 3, point(1)));

  out.push(
    sample("LookAround", 4, (t) => {
      const y = 0.55 * Math.sin((t / 4) * TAU);
      return { hips: { rot: [0, y * 0.25, 0], ...breathe(t) }, head: { rot: [0.05 * Math.abs(Math.sin((t / 4) * TAU)), y, 0] } };
    }),
  );
  out.push(sample("LookUp", 3, (t) => ({ hips: { rot: [-0.05, 0, 0], ...breathe(t) }, head: { rot: [-0.38 + 0.03 * sin(t, 3), 0.05 * sin(t, 3), 0] } })));
  out.push(sample("LookDown", 3, (t) => ({ hips: { rot: [0.06, 0, 0], ...breathe(t) }, head: { rot: [0.32 + 0.02 * sin(t, 3), 0, 0.03 * sin(t, 3)] } })));

  // Think: hand to the chin, head tilted.
  out.push(
    sample("Think", 3, (t) => ({
      hips: { ...breathe(t) },
      head: { rot: [-0.08, 0.16, 0.16 + 0.03 * sin(t, 3)] },
      armR: { rot: [-1.95, 0, -0.5 + 0.05 * sin(t, 1.5)] },
      armL: { rot: [-0.55, 0, 0.35] },
    })),
  );

  // Happy: bouncy, arms a little out.
  out.push(
    sample("Happy", 1.2, (t) => {
      const b = Math.abs(sin(t, 1.2));
      return {
        hips: { pos: [0, 0.04 * b, 0], scale: [0.02 * (1 - b), -0.03 * (1 - b), 0.02 * (1 - b)], rot: [0, 0, 0.05 * sin(t, 1.2)] },
        head: { rot: [-0.08, 0, 0.12 * sin(t, 1.2)] },
        armL: { rot: [0, 0, -0.55 - 0.25 * b] },
        armR: { rot: [0, 0, 0.55 + 0.25 * b] },
      };
    }),
  );

  // Jump and celebrate share a jump arc: crouch, up, land.
  const arc = (t: number, d: number) => {
    const u = t / d;
    if (u < 0.22) return { y: -0.03 * ease(u / 0.22), squash: -0.08 * ease(u / 0.22) };
    if (u < 0.72) {
      const a = (u - 0.22) / 0.5;
      return { y: 0.22 * Math.sin(a * Math.PI), squash: 0.05 * Math.sin(a * Math.PI) };
    }
    const l = (u - 0.72) / 0.28;
    return { y: -0.02 * Math.sin(l * Math.PI), squash: -0.06 * Math.sin(l * Math.PI) };
  };
  out.push(
    sample("Jump", 1.1, (t) => {
      const a = arc(t, 1.1);
      return {
        hips: { pos: [0, a.y, 0], scale: [-a.squash * 0.5, a.squash, -a.squash * 0.5] },
        legL: { pos: [0, Math.max(0, a.y), 0], rot: [-0.3 * Math.max(0, a.y) * 4, 0, 0] },
        legR: { pos: [0, Math.max(0, a.y), 0], rot: [-0.3 * Math.max(0, a.y) * 4, 0, 0] },
        armL: { rot: [0, 0, -0.9 * Math.max(0, a.y) * 4] },
        armR: { rot: [0, 0, 0.9 * Math.max(0, a.y) * 4] },
      };
    }),
  );
  out.push(
    sample("Celebrate", 1.6, (t) => {
      const a = arc(Math.min(t, 1.1), 1.1);
      const k = env(t, 1.6, 0.25);
      return {
        hips: { pos: [0, a.y, 0], scale: [-a.squash * 0.5, a.squash, -a.squash * 0.5], rot: [0, 0, 0.06 * sin(t, 0.4) * k] },
        head: { rot: [-0.2 * k, 0, 0.1 * sin(t, 0.4) * k] },
        legL: { pos: [0, Math.max(0, a.y), 0] },
        legR: { pos: [0, Math.max(0, a.y), 0] },
        armL: { rot: [0, 0, (-2.55 - 0.2 * sin(t, 0.4)) * k] },
        armR: { rot: [0, 0, (2.55 + 0.2 * sin(t, 0.4, 1)) * k] },
      };
    }),
  );

  // Sit (and sleep, which is sitting with the head down).
  const sit = (t: number): Rig => ({
    hips: { pos: [0, -0.06, -0.02], rot: [-0.12, 0, 0], ...breathe(t, 3.5, 0.016) },
    legL: { rot: [-1.25, -0.2, 0], pos: [0, -0.05, 0.05] },
    legR: { rot: [-1.25, 0.2, 0], pos: [0, -0.05, 0.05] },
    armL: { rot: [-0.45, 0, 0.12] },
    armR: { rot: [-0.45, 0, -0.12] },
  });
  out.push(sample("Sit", 3.5, (t) => ({ ...sit(t), head: { rot: [0.02 * sin(t, 3.5), 0.05 * sin(t, 7), 0.03 * sin(t, 3.5)] } })));
  out.push(sample("Sleep", 4, (t) => ({ ...sit(t), hips: { ...sit(t).hips, ...breathe(t, 4, 0.03) }, head: { rot: [0.38 + 0.03 * sin(t, 4), 0, 0.22] } })));

  // Typing on an invisible keyboard.
  out.push(
    sample("Typing", 1, (t) => ({
      hips: { rot: [0.08, 0, 0], ...breathe(t, 1, 0.006) },
      head: { rot: [0.18, 0, 0] },
      armL: { rot: [-1.2 + 0.08 * sin(t, 0.25), 0, 0.28] },
      armR: { rot: [-1.2 + 0.08 * sin(t, 0.25, Math.PI), 0, -0.28] },
    })),
  );

  // Listening: a hand on the headphone, nodding to the beat.
  out.push(
    sample("Listening", 1.25, (t) => ({
      hips: { rot: [0, 0, 0.04 * sin(t, 1.25)], pos: [0, 0.008 * Math.abs(sin(t, 0.625)), 0] },
      head: { rot: [0.08 * Math.abs(sin(t, 0.625)), 0, -0.16] },
      armR: { rot: [-0.35, 0, 2.35] },
      armL: { rot: [0, 0, -0.1 - 0.06 * sin(t, 1.25)] },
    })),
  );

  // Easter egg: a small dance.
  out.push(
    sample("Dance", 2.4, (t) => {
      const s = sin(t, 1.2);
      const b = Math.abs(sin(t, 0.6));
      return {
        hips: { pos: [0.03 * s, 0.03 * b, 0], rot: [0, 0.35 * s, 0.1 * s] },
        head: { rot: [0, -0.2 * s, 0.15 * s] },
        armL: { rot: [0, 0, -1.2 - 1.1 * Math.max(0, s)] },
        armR: { rot: [0, 0, 1.2 + 1.1 * Math.max(0, -s)] },
        legL: { rot: [0.3 * Math.max(0, s), 0, 0], pos: [0, 0.03 * Math.max(0, s), 0] },
        legR: { rot: [0.3 * Math.max(0, -s), 0, 0], pos: [0, 0.03 * Math.max(0, -s), 0] },
      };
    }),
  );

  return out;
}
