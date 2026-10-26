/**
 * A two-wheel robot on a floor, as its own physical model (not the circuit's DC motor):
 * - Each wheel is a geared DC motor with a linear torque–speed curve, τ = τs·(V/Vn) − τs·ω/ω0, so
 *   back-EMF limits speed and the load slows it; an L298N-style driver feeds it from the battery
 *   minus the driver's drop, by the PWM duty and direction from the Arduino's pins. Both inputs high
 *   short the motor (it brakes); both low let it coast.
 * - The gearbox has dry friction: it holds the wheel until the motor's torque beats it, so low PWM
 *   doesn't move the robot at all and half PWM is clearly slower than full.
 * - The body has mass and a moment of inertia, rolling resistance, and wheels that roll without
 *   slipping sideways (the usual assumption for a small robot on a flat floor; skids aren't modelled).
 * - Line sensors look at the floor under them; the track is a line of tape of known width.
 * Numbers default to a common kit (TT gear motors, 66 mm wheels, 2-cell battery) and can be changed.
 */

export type Vec = { x: number; y: number };
export type RobotParams = {
  mass: number; // kg
  inertia: number; // kg·m²
  wheelRadius: number; // m
  track: number; // distance between the wheels, m
  vBattery: number; // V
  vDriverDrop: number; // V lost in the driver (L298N ≈ 1.4–2 V)
  vNominal: number; // motor rating, V
  noLoadSpeed: number; // wheel rad/s at the rating
  stallTorque: number; // wheel N·m at the rating
  gearFriction: number; // wheel N·m lost in the gearbox (why a motor won't start at low PWM)
  rollingResistance: number; // N per m/s
  turnResistance: number; // N·m per rad/s
  sensors: { name: string; ahead: number; side: number }[]; // m from the axle centre (side > 0 = left)
};

export const DEFAULT_ROBOT: RobotParams = {
  mass: 0.55,
  inertia: 0.0021,
  wheelRadius: 0.033,
  track: 0.13,
  vBattery: 7.4,
  vDriverDrop: 1.4,
  vNominal: 6,
  noLoadSpeed: (200 * 2 * Math.PI) / 60,
  stallTorque: 0.078,
  gearFriction: 0.008,
  rollingResistance: 0.8,
  turnResistance: 0.004,
  sensors: [
    { name: "L", ahead: 0.075, side: 0.022 },
    { name: "C", ahead: 0.075, side: 0 },
    { name: "R", ahead: 0.075, side: -0.022 },
  ],
};

/** One motor channel as the driver sees it: enable duty (PWM) and the two direction inputs' duties. */
export type Channel = { en: number; a: number; b: number };
export type RobotState = { x: number; y: number; heading: number; v: number; w: number; wl: number; wr: number };

export const startState = (at: Vec, heading: number): RobotState => ({ x: at.x, y: at.y, heading, v: 0, w: 0, wl: 0, wr: 0 });

/**
 * Average wheel torque for a channel at wheel speed ω (rad/s). The pins' duties split the time into
 * driven forward, driven backward, shorted (both inputs high: braking) and open (coasting):
 * driven τ = ±kt·Vm − kb·ω, shorted τ = −kb·ω, open τ = 0.
 */
export function motorTorque(p: RobotParams, ch: Channel, omega: number): number {
  const vm = Math.max(0, p.vBattery - p.vDriverDrop);
  const kt = p.stallTorque / p.vNominal; // N·m per volt with the wheel held
  const kb = p.stallTorque / p.noLoadSpeed; // N·m per rad/s (back-EMF)
  const fwd = ch.en * ch.a * (1 - ch.b);
  const back = ch.en * ch.b * (1 - ch.a);
  const shorted = ch.en * ch.a * ch.b;
  return fwd * (kt * vm - kb * omega) + back * (-kt * vm - kb * omega) + shorted * (-kb * omega);
}

/** Motor torque less the gearbox's dry friction: it opposes turning, and holds a (nearly) still wheel up to its limit. */
function wheelTorque(p: RobotParams, ch: Channel, omega: number): number {
  const t = motorTorque(p, ch, omega);
  if (Math.abs(omega) > 0.05) return t - Math.sign(omega) * p.gearFriction;
  return Math.abs(t) <= p.gearFriction ? 0 : t - Math.sign(t) * p.gearFriction;
}

/** Advance by dt seconds (use small steps, ~1 ms). */
export function step(p: RobotParams, s: RobotState, left: Channel, right: Channel, dt: number): RobotState {
  const half = p.track / 2;
  const wl = (s.v - s.w * half) / p.wheelRadius;
  const wr = (s.v + s.w * half) / p.wheelRadius;
  const fl = wheelTorque(p, left, wl) / p.wheelRadius;
  const fr = wheelTorque(p, right, wr) / p.wheelRadius;
  const a = (fl + fr - p.rollingResistance * s.v) / p.mass;
  const alpha = ((fr - fl) * half - p.turnResistance * s.w) / p.inertia;
  const v = s.v + a * dt;
  const w = s.w + alpha * dt;
  const heading = s.heading + w * dt;
  return { x: s.x + v * Math.cos(heading) * dt, y: s.y + v * Math.sin(heading) * dt, heading, v, w, wl, wr };
}

/** Where a sensor is on the floor. */
export function sensorAt(s: RobotState, sensor: { ahead: number; side: number }): Vec {
  const c = Math.cos(s.heading);
  const n = Math.sin(s.heading);
  return { x: s.x + sensor.ahead * c - sensor.side * n, y: s.y + sensor.ahead * n + sensor.side * c };
}

/* ─── Track ───────────────────────────────────────────────────────────── */

export type Track = { id: string; name: { en: string; ar: string }; points: Vec[]; closed: boolean; width: number; start: Vec; heading: number; size: { w: number; h: number } };

function segDist(p: Vec, a: Vec, b: Vec): { d: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1e-12;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { d: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)), t };
}

/** Distance from the line's centre, and how far along the line (0–1) the nearest point is. */
export function nearest(track: Track, p: Vec): { d: number; along: number } {
  const pts = track.points;
  const n = track.closed ? pts.length : pts.length - 1;
  let best = { d: Infinity, along: 0 };
  let total = 0;
  const lens: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    lens.push(Math.hypot(b.x - a.x, b.y - a.y));
    total += lens[i];
  }
  let run = 0;
  for (let i = 0; i < n; i++) {
    const r = segDist(p, pts[i], pts[(i + 1) % pts.length]);
    if (r.d < best.d) best = { d: r.d, along: (run + r.t * lens[i]) / total };
    run += lens[i];
  }
  return best;
}

/** True when the point is on the tape. */
export const onLine = (track: Track, p: Vec) => nearest(track, p).d <= track.width / 2;
