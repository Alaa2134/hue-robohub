/**
 * BuildX HUE letterforms — parametric (stroke S, chamfer K) on a 100-unit cap height.
 * Rules: 45° chamfers only on the leading top-left and trailing bottom-right corners;
 * all horizontals share one "axis band" at mid height so H, R, B, E line up into a single line.
 */
export const C = 100;

const P = (pts) => "M" + pts.map(([x, y]) => `${+x.toFixed(2)} ${+y.toFixed(2)}`).join("L") + "Z";
const Rect = (x0, y0, x1, y1) => P([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);

export function makeGlyphs({ S = 22, K = 16, wide = 1 } = {}) {
  const mt = 50 - S / 2, mb = 50 + S / 2;
  const W = (n) => n * wide;
  const H = W(92), U = W(92), E = W(80), Rw = W(94), O = W(96), B = W(94), L = W(78), D = W(94), X = W(100);
  const t = S * 1.35; // diagonal stroke, measured horizontally
  const yt = (C * (X / 2 - t)) / (X - t);
  return {
    H: { w: H, d: [P([[0, K], [K, 0], [S, 0], [S, mt], [H - S, mt], [H - S, 0], [H, 0], [H, C - K], [H - K, C], [H - S, C], [H - S, mb], [S, mb], [S, C], [0, C]])] },
    U: { w: U, d: [P([[0, K], [K, 0], [S, 0], [S, C - S], [U - S, C - S], [U - S, 0], [U, 0], [U, C - K], [U - K, C], [0, C]])] },
    E: { w: E, d: [P([[0, K], [K, 0], [E, 0], [E, S], [S, S], [S, mt], [E - 12, mt], [E - 12, mb], [S, mb], [S, C - S], [E, C - S], [E, C - K], [E - K, C], [0, C]])] },
    R: {
      w: Rw,
      d: [
        P([[0, K], [K, 0], [Rw - K, 0], [Rw, K], [Rw, mb - 10], [Rw - 10, mb], [Rw - 26 + S * 0.2, mb], [Rw, C], [Rw - S * 1.15, C], [Rw - 26 - S * 1.15 + S * 0.2, mb], [S, mb], [S, C], [0, C]]),
        Rect(S, S, Rw - S, mt),
      ],
    },
    I: { w: S, d: [P([[0, K], [K, 0], [S, 0], [S, C - K], [S - K, C], [0, C]])] },
    L: { w: L, d: [P([[0, K], [K, 0], [S, 0], [S, C - S], [L, C - S], [L, C - K], [L - K, C], [0, C]])] },
    D: {
      w: D,
      d: [
        P([[0, K], [K, 0], [D - 30, 0], [D, 30], [D, C - 30], [D - 30, C], [0, C]]),
        P([[S, S], [D - S - 16, S], [D - S, S + 16], [D - S, C - S - 16], [D - S - 16, C - S], [S, C - S]]),
      ],
    },
    // One outline (not two overlapping bars) so even-odd filling never punches a hole at the crossing.
    X: {
      w: X,
      d: [P([[0, 0], [t, 0], [X / 2, yt], [X - t, 0], [X, 0], [(X + t) / 2, C / 2], [X, C], [X - t, C], [X / 2, C - yt], [t, C], [0, C], [(X - t) / 2, C / 2]])],
    },
    O: { w: O, d: [P([[0, K], [K, 0], [O, 0], [O, C - K], [O - K, C], [0, C]]), Rect(S, S, O - S, C - S)] },
    B: {
      w: B,
      d: [
        P([[0, K], [K, 0], [B - 14, 0], [B, 14], [B, mt - 2], [B - 8, 50], [B, mb + 2], [B, C - K], [B - K, C], [0, C]]),
        Rect(S, S, B - S - 2, mt),
        Rect(S, mb, B - S, C - S),
      ],
    },
  };
}

export function layout(glyphs, text, tracking = 10, space = 40) {
  let x = 0;
  const out = [];
  for (const ch of text) {
    if (ch === " ") {
      x += space;
      continue;
    }
    const g = glyphs[ch];
    out.push({ x, d: g.d.join(""), ch });
    x += g.w + tracking;
  }
  return { width: x - tracking, glyphs: out };
}
