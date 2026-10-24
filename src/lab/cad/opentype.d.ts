// The small part of opentype.js the 3D Studio uses (the package ships no types).
declare module "opentype.js" {
  export type PathCommand =
    | { type: "M" | "L"; x: number; y: number }
    | { type: "Q"; x1: number; y1: number; x: number; y: number }
    | { type: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { type: "Z" };
  export interface Font {
    getPath(text: string, x: number, y: number, fontSize: number): { commands: PathCommand[] };
  }
  export function parse(buffer: ArrayBuffer): Font;
}
