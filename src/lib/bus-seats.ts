/**
 * A bus seen from above, front at the top: rows of two seats, the aisle, two seats; the back row is
 * five across (the aisle too). Seats are numbered row by row from the front, driver's side first —
 * the way the seats in a coach are usually numbered.
 */
export type BusRow = (number | null)[];

/** The rows of a bus with this many seats: null is the aisle. */
export function busRows(seats: number): BusRow[] {
  const total = Math.max(1, Math.min(99, Math.round(seats)));
  if (total <= 5) return [Array.from({ length: total }, (_, i) => i + 1)];
  const front = total - 5;
  const rows: BusRow[] = [];
  let n = 1;
  for (let left = front; left > 0; left -= 4) {
    const k = Math.min(4, left);
    // A short row (seats that don't fill four) keeps the driver's side first: [1, 2, aisle, 3].
    const row: BusRow = [n, k > 1 ? n + 1 : null, null, k > 2 ? n + 2 : null, k > 3 ? n + 3 : null];
    rows.push(row);
    n += k;
  }
  rows.push([n, n + 1, n + 2, n + 3, n + 4]);
  return rows;
}

/** Seats that sit side by side (same row, same side of the aisle, or neighbours on the back row). */
export function neighbours(rows: BusRow[]): Map<number, number[]> {
  const out = new Map<number, number[]>();
  const link = (a: number | null, b: number | null) => {
    if (a == null || b == null) return;
    out.set(a, [...(out.get(a) ?? []), b]);
    out.set(b, [...(out.get(b) ?? []), a]);
  };
  rows.forEach((row, i) => {
    if (i === rows.length - 1 && !row.includes(null)) for (let k = 0; k < row.length - 1; k++) link(row[k], row[k + 1]);
    else {
      link(row[0], row[1]);
      link(row[3], row[4]);
    }
  });
  return out;
}

/**
 * Seat everyone in order (the order given, e.g. who registered first), keeping people who came
 * together (a friend answer pointing at someone on the same bus) on the same pair of seats when they
 * can be. Who doesn't fit stays without a seat.
 */
export function autoSeat(people: { id: string; friend?: string | null }[], seats: number): Record<string, number> {
  const ids = new Set(people.map((p) => p.id));
  // Groups of people who named each other, in the order the first of them registered.
  const parent = new Map(people.map((p) => [p.id, p.id]));
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  for (const p of people) if (p.friend && ids.has(p.friend) && p.friend !== p.id) parent.set(find(p.id), find(p.friend));
  const groups = new Map<string, string[]>();
  for (const p of people) groups.set(find(p.id), [...(groups.get(find(p.id)) ?? []), p.id]);
  const queue = [...groups.values()];

  // Seats in the order to fill them, as pairs that sit together (the back row as one block).
  const rows = busRows(seats);
  const blocks: number[][] = rows.flatMap((row, i) =>
    i === rows.length - 1 && !row.includes(null) ? [row as number[]] : [row.slice(0, 2), row.slice(3, 5)].map((b) => b.filter((s): s is number => s != null)).filter((b) => b.length),
  );
  const out: Record<string, number> = {};
  const free = blocks.map((b) => [...b]);
  const take = (n: number) => {
    // The first block with room for the whole group, else the next seats in order.
    const whole = free.find((b) => b.length >= n);
    if (whole) return whole.splice(0, n);
    const got: number[] = [];
    for (const b of free) while (b.length && got.length < n) got.push(b.shift()!);
    return got;
  };
  for (const g of queue) {
    const got = take(g.length);
    g.forEach((id, i) => {
      if (got[i] != null) out[id] = got[i];
    });
  }
  return out;
}
