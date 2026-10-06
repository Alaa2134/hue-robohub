/**
 * BuildX mark — a bold X: the rising stroke in white, the falling stroke (top-left → bottom-right)
 * in electric blue on top: "the axis". 118 × 100 grid.
 */
const P = (pts) => "M" + pts.map(([x, y]) => `${+x.toFixed(2)} ${+y.toFixed(2)}`).join("L") + "Z";

export const MARK_W = 118;
export const MARK = {
  body: P([[84, 0], [118, 0], [34, 100], [0, 100]]),
  axis: P([[0, 0], [34, 0], [118, 100], [84, 100]]),
};

export const PLATE = P([[0, 0], [80, 0], [100, 20], [100, 100], [20, 100], [0, 80]]);
