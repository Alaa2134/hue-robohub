/**
 * A printable case for an Arduino Uno R3, as an editable 3D Studio design: an open tray with four
 * standoffs on the board's mounting holes, cutouts for the USB-B and DC jacks, and a lid that is
 * printed upside down. Board numbers are from Arduino's Uno R3 drawing (68.6 × 53.4 mm; holes in
 * mils converted to mm); the jack cutouts are generous, so measure your board before printing.
 */
import { cadId, type CadDoc, type CadObject, type Vec3 } from "./model";

export const UNO = {
  w: 68.6,
  d: 53.4,
  pcb: 1.6,
  /** Mounting holes (3.2 mm), from the board's lower-left corner, USB side at x = 0. */
  holes: [
    [13.97, 2.54],
    [15.24, 50.8],
    [66.04, 7.62],
    [66.04, 35.56],
  ] as [number, number][],
  /** Jacks on the x = 0 edge: centre y, width and height above the board (mm). */
  usb: { y: 44.1, w: 12.2, h: 11 },
  dc: { y: 7.6, w: 9, h: 11 },
};

const WALL = 2;
const FLOOR = 2;
const GAP = 1; // clearance around the board
const STANDOFF = 5; // board sits this far above the floor
const HEIGHT = FLOOR + STANDOFF + UNO.pcb + 13;

const obj = (name: string, kind: CadObject["kind"], params: CadObject["params"], position: Vec3, extra: Partial<CadObject> = {}): CadObject => ({
  id: cadId(),
  name,
  kind,
  params,
  position,
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  color: extra.hole ? "#8e8e93" : "#3e8bff",
  ...extra,
});

export function unoCase(): CadDoc {
  const iw = UNO.w + 2 * GAP;
  const id = UNO.d + 2 * GAP;
  const ow = iw + 2 * WALL;
  const od = id + 2 * WALL;
  // Board corner (0, 0) in the case's coordinates: the board is centred.
  const bx = -UNO.w / 2;
  const by = -UNO.d / 2;
  const boardTop = FLOOR + STANDOFF + UNO.pcb;
  const cut = (name: string, j: { y: number; w: number; h: number }) =>
    obj(name, "box", { w: WALL * 3, d: j.w + 2, h: j.h + 2, r: 0 }, [-ow / 2 + WALL / 2, by + j.y, boardTop - 1], { hole: true });
  const shell: CadObject = {
    ...obj("Shell", "group", {}, [0, 0, 0]),
    op: "union",
    children: [
      obj("Outer", "box", { w: ow, d: od, h: HEIGHT, r: 0 }, [0, 0, 0]),
      obj("Inside", "box", { w: iw, d: id, h: HEIGHT, r: 0 }, [0, 0, FLOOR], { hole: true }),
      cut("USB opening", UNO.usb),
      cut("DC jack opening", UNO.dc),
    ],
  };
  const standoffs = UNO.holes.map(([x, y], i) => obj(`Standoff ${i + 1}`, "cylinder", { dia: 6, h: STANDOFF, seg: 48 }, [bx + x, by + y, FLOOR]));
  // 2.6 mm pilot holes: M3 screws tap their own thread in the plastic.
  const pilots = UNO.holes.map(([x, y], i) => obj(`Screw hole ${i + 1}`, "cylinder", { dia: 2.6, h: STANDOFF + 1, seg: 32 }, [bx + x, by + y, FLOOR + 0.5], { hole: true }));
  const base: CadObject = { ...obj("Arduino Uno case", "group", {}, [0, 0, 0]), op: "union", children: [shell, ...standoffs, ...pilots] };
  // Lid, printed upside down beside the case: a plate and a lip that fits inside the walls.
  const lid: CadObject = {
    ...obj("Lid", "group", {}, [ow + 10, 0, 0]),
    op: "union",
    children: [obj("Plate", "box", { w: ow, d: od, h: 2, r: 0 }, [0, 0, 0]), obj("Lip", "box", { w: iw - 0.4, d: id - 0.4, h: 2, r: 0 }, [0, 0, 2])],
  };
  return { v: 1, type: "cad", objects: [base, lid] };
}

export const CASE_SIZE = { w: UNO.w + 2 * GAP + 2 * WALL, d: UNO.d + 2 * GAP + 2 * WALL, h: HEIGHT };
