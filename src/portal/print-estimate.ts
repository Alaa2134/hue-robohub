/**
 * What the Print Hub can tell from a 3D file before anyone slices it: the size, the volume (from the
 * mesh itself) and a rough filament weight and time. Rough on purpose — the price is set only from
 * what the team's slicer reports — so the weight and time are given as a range.
 */
export type Mesh = { volume: number; bbox: [number, number, number]; triangles: number }; // mm³, mm

/** Signed volume of a closed triangle mesh (sum of tetrahedra to the origin) and its bounding box. */
function measure(tri: (cb: (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) => void) => void): Mesh {
  let v = 0;
  let n = 0;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const grow = (x: number, y: number, z: number) => {
    if (x < lo[0]) lo[0] = x;
    if (y < lo[1]) lo[1] = y;
    if (z < lo[2]) lo[2] = z;
    if (x > hi[0]) hi[0] = x;
    if (y > hi[1]) hi[1] = y;
    if (z > hi[2]) hi[2] = z;
  };
  tri((ax, ay, az, bx, by, bz, cx, cy, cz) => {
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    grow(ax, ay, az);
    grow(bx, by, bz);
    grow(cx, cy, cz);
    n++;
  });
  if (!n) throw new Error("empty");
  return { volume: Math.abs(v), bbox: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], triangles: n };
}

export function parseStl(buf: ArrayBuffer): Mesh {
  const dv = new DataView(buf);
  const count = buf.byteLength >= 84 ? dv.getUint32(80, true) : 0;
  if (count > 0 && 84 + count * 50 === buf.byteLength) {
    return measure((cb) => {
      for (let i = 0; i < count; i++) {
        const o = 84 + i * 50 + 12;
        const f = (k: number) => dv.getFloat32(o + k * 4, true);
        cb(f(0), f(1), f(2), f(3), f(4), f(5), f(6), f(7), f(8));
      }
    });
  }
  const text = new TextDecoder().decode(buf);
  const nums = [...text.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
  return measure((cb) => {
    for (let i = 0; i + 2 < nums.length; i += 3) cb(...(nums[i] as [number, number, number]), ...(nums[i + 1] as [number, number, number]), ...(nums[i + 2] as [number, number, number]));
  });
}

export function parseObj(text: string): Mesh {
  const vs: number[][] = [];
  const faces: number[][] = [];
  for (const line of text.split(/\r?\n/)) {
    const p = line.trim().split(/\s+/);
    if (p[0] === "v") vs.push([Number(p[1]), Number(p[2]), Number(p[3])]);
    else if (p[0] === "f") faces.push(p.slice(1).map((x) => { const i = parseInt(x, 10); return i < 0 ? vs.length + i : i - 1; }));
  }
  return measure((cb) => {
    for (const f of faces) for (let k = 1; k + 1 < f.length; k++) {
      const [a, b, c] = [vs[f[0]], vs[f[k]], vs[f[k + 1]]];
      if (a && b && c) cb(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    }
  });
}

/** Read a file the student picked; 3MF (a zip) isn't measured here — the slicer will. */
export async function measureFile(file: File): Promise<Mesh | null> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "stl") return parseStl(await file.arrayBuffer());
  if (ext === "obj") return parseObj(await file.text());
  return null;
}

const SPEED = { draft: 16, normal: 11, fine: 7 } as const; // grams per hour, a common FDM ballpark

/**
 * A rough range: walls and top/bottom take about a quarter of a small part's volume, the infill
 * fills the rest at its percentage. ±35 % on weight and time; never the price.
 */
export function roughEstimate(m: Mesh, o: { density: number; infill: number; quality: keyof typeof SPEED; quantity: number }) {
  const cm3 = m.volume / 1000;
  const fill = Math.min(1, 0.25 + 0.75 * (o.infill / 100));
  const grams = cm3 * o.density * fill * o.quantity;
  const hours = grams / SPEED[o.quality];
  return { cm3, grams: [grams * 0.65, grams * 1.35] as const, hours: [hours * 0.65, hours * 1.35] as const };
}
