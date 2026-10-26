/** Line-following tracks (metres, y up) and the robot's fixed wiring. */
import type { Track, Vec } from "./physics";

const TAPE = 0.019; // 19 mm electrical tape

function arc(cx: number, cy: number, r: number, a0: number, a1: number, n: number): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

/** Oval: two 0.8 m straights joined by half circles of 0.3 m. */
function oval(): Vec[] {
  const r = 0.3;
  return [{ x: 0.4, y: 0.5 }, { x: 1.2, y: 0.5 }, ...arc(1.2, 0.8, r, -Math.PI / 2, Math.PI / 2, 24).slice(1), { x: 0.4, y: 1.1 }, ...arc(0.4, 0.8, r, Math.PI / 2, (3 * Math.PI) / 2, 24).slice(1, -1)];
}

/** Rounded rectangle with tighter corners. */
function rounded(): Vec[] {
  const r = 0.15;
  const [x0, y0, x1, y1] = [0.3, 0.3, 1.7, 1.3];
  return [
    ...arc(x1 - r, y0 + r, r, -Math.PI / 2, 0, 10),
    ...arc(x1 - r, y1 - r, r, 0, Math.PI / 2, 10),
    ...arc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, 10),
    ...arc(x0 + r, y0 + r, r, Math.PI, (3 * Math.PI) / 2, 10),
  ];
}

/** A wavy loop: an oval whose straights bend in and out (S-bends). */
function wavy(): Vec[] {
  const out: Vec[] = [];
  const n = 120;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI;
    const rx = 0.75 + 0.08 * Math.sin(3 * t);
    const ry = 0.45 + 0.06 * Math.cos(5 * t);
    out.push({ x: 1.0 + rx * Math.cos(t), y: 0.8 + ry * Math.sin(t) });
  }
  return out;
}

export const TRACKS: Track[] = [
  { id: "oval", name: { en: "Oval", ar: "بيضاوي" }, points: oval(), closed: true, width: TAPE, start: { x: 0.6, y: 0.5 }, heading: 0, size: { w: 1.6, h: 1.6 } },
  { id: "rounded", name: { en: "Tight corners", ar: "زوايا ضيقة" }, points: rounded(), closed: true, width: TAPE, start: { x: 0.8, y: 0.3 }, heading: 0, size: { w: 2.0, h: 1.6 } },
  { id: "wavy", name: { en: "S-bends", ar: "منحنيات S" }, points: wavy(), closed: true, width: TAPE, start: { x: 1.75, y: 0.8 }, heading: Math.PI / 2, size: { w: 2.0, h: 1.6 } },
];
export const trackById = (id: string) => TRACKS.find((t) => t.id === id) ?? TRACKS[0];

/**
 * The robot's wiring (fixed, like a kit): an L298N driver and three IR line sensors.
 * Left motor: ENA = D5 (PWM), IN1 = D7, IN2 = D8. Right motor: ENB = D6 (PWM), IN3 = D9, IN4 = D10.
 * IN1 HIGH + IN2 LOW drives a wheel forward. Sensors (TCRT5000 modules): left D2, centre D3,
 * right D4; HIGH over the black line, LOW over the white floor.
 */
export const PINS = { ena: 5, in1: 7, in2: 8, enb: 6, in3: 9, in4: 10, sensors: { L: 2, C: 3, R: 4 } as Record<string, number> };

export const STARTER = `// Line follower: L298N on D5/D7/D8 (left) and D6/D9/D10 (right).
// IR sensors: left D2, centre D3, right D4 — HIGH means "I see the black line".
const int ENA = 5, IN1 = 7, IN2 = 8;   // left motor
const int ENB = 6, IN3 = 9, IN4 = 10;  // right motor
const int SL = 2, SC = 3, SR = 4;      // sensors

void drive(int left, int right) {      // -255..255 each
  digitalWrite(IN1, left >= 0);  digitalWrite(IN2, left < 0);
  digitalWrite(IN3, right >= 0); digitalWrite(IN4, right < 0);
  analogWrite(ENA, abs(left));
  analogWrite(ENB, abs(right));
}

void setup() {
  pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(ENB, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  pinMode(SL, INPUT); pinMode(SC, INPUT); pinMode(SR, INPUT);
}

int lastSide = 0;                       // -1 = line was last on the left, 1 = right

void loop() {
  bool l = digitalRead(SL), c = digitalRead(SC), r = digitalRead(SR);
  if (l) lastSide = -1;
  if (r) lastSide = 1;
  if (c && !l && !r) drive(130, 130);    // on the line: straight
  else if (l) drive(20, 150);            // line to the left: turn left
  else if (r) drive(150, 20);            // line to the right: turn right
  else if (lastSide < 0) drive(-60, 140); // lost: spin back towards where it was
  else if (lastSide > 0) drive(140, -60);
  else drive(100, 100);
}
`;
