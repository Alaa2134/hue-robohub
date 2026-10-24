/**
 * DC circuit solver: modified nodal analysis on node voltages (node 0 is ground). Sources are written
 * in Norton form (a conductance plus a current), so the matrix stays node-sized. Diodes, LEDs,
 * transistors and MOSFETs are piecewise-linear: the solver guesses each one's state (off / on,
 * cut-off / active / saturated), solves, and re-guesses until the states agree with the voltages.
 */

export type Elem =
  | { t: "R"; a: number; b: number; r: number }
  /** Voltage source with series resistance: V(a) − V(b) = v when no current flows. */
  | { t: "V"; a: number; b: number; v: number; r: number }
  | { t: "D"; a: number; k: number; vf: number; ron: number }
  | { t: "Q"; c: number; b: number; e: number; beta: number; pnp: boolean }
  | { t: "M"; d: number; g: number; s: number; vth: number; ron: number; p: boolean }
  /** A driven pin or device output: its (v, r) come from the `drives` map each solve; null = high impedance. */
  | { t: "X"; a: number; b: number; key: string };

export type Drive = { v: number; r: number } | null;
export type Solution = { v: Float64Array; i: Float64Array; ok: boolean };

const GMIN = 1e-9;
const VBE = 0.65;
const RBE = 50;
const VCE_SAT = 0.15;
const RCE_SAT = 2;
const ROFF = 1e9;

/** Dense LU with partial pivoting; returns false when singular. */
function solveDense(A: Float64Array, b: Float64Array, n: number): boolean {
  for (let k = 0; k < n; k++) {
    let p = k;
    let max = Math.abs(A[k * n + k]);
    for (let r = k + 1; r < n; r++) {
      const v = Math.abs(A[r * n + k]);
      if (v > max) (max = v), (p = r);
    }
    if (max < 1e-18) return false;
    if (p !== k) {
      for (let c = 0; c < n; c++) {
        const t = A[k * n + c];
        A[k * n + c] = A[p * n + c];
        A[p * n + c] = t;
      }
      const t = b[k];
      b[k] = b[p];
      b[p] = t;
    }
    const d = A[k * n + k];
    for (let r = k + 1; r < n; r++) {
      const f = A[r * n + k] / d;
      if (f === 0) continue;
      for (let c = k; c < n; c++) A[r * n + c] -= f * A[k * n + c];
      b[r] -= f * b[k];
    }
  }
  for (let k = n - 1; k >= 0; k--) {
    let s = b[k];
    for (let c = k + 1; c < n; c++) s -= A[k * n + c] * b[c];
    b[k] = s / A[k * n + k];
  }
  return true;
}

export class Circuit {
  /** Device states between solves (a good first guess for the next one). */
  private state: Int8Array;
  constructor(
    readonly nodes: number,
    readonly elems: Elem[],
  ) {
    this.state = new Int8Array(elems.length);
  }

  solve(drives: Map<string, Drive>): Solution {
    const n = this.nodes - 1; // unknowns: nodes 1..N-1
    const st = this.state;
    let v = new Float64Array(this.nodes);
    for (let iter = 0; iter < 60; iter++) {
      const A = new Float64Array(n * n);
      const rhs = new Float64Array(n);
      const g = (a: number, b: number, G: number) => {
        if (a) A[(a - 1) * n + (a - 1)] += G;
        if (b) A[(b - 1) * n + (b - 1)] += G;
        if (a && b) {
          A[(a - 1) * n + (b - 1)] -= G;
          A[(b - 1) * n + (a - 1)] -= G;
        }
      };
      /** Current I flowing out of node `from` through the element into node `to`. */
      const cur = (from: number, to: number, I: number) => {
        if (from) rhs[from - 1] -= I;
        if (to) rhs[to - 1] += I;
      };
      /** Current gm·(V(cp) − V(cn)) flowing from node `op` through the element to node `on`. */
      const vccs = (op: number, on: number, cp: number, cn: number, gm: number) => {
        const add = (r: number, c: number, x: number) => {
          if (r && c) A[(r - 1) * n + (c - 1)] += x;
        };
        add(op, cp, gm);
        add(op, cn, -gm);
        add(on, cp, -gm);
        add(on, cn, gm);
      };
      const source = (a: number, b: number, V: number, R: number) => {
        g(a, b, 1 / R);
        cur(b, a, V / R);
      };
      for (let i = 1; i < this.nodes; i++) A[(i - 1) * n + (i - 1)] += GMIN;

      this.elems.forEach((e, idx) => {
        switch (e.t) {
          case "R":
            g(e.a, e.b, 1 / Math.max(e.r, 1e-6));
            break;
          case "V":
            source(e.a, e.b, e.v, Math.max(e.r, 1e-6));
            break;
          case "X": {
            const d = drives.get(e.key);
            if (d) source(e.a, e.b, d.v, Math.max(d.r, 1e-6));
            break;
          }
          case "D":
            if (st[idx] === 1) source(e.a, e.k, e.vf, e.ron);
            else g(e.a, e.k, 1 / ROFF);
            break;
          case "Q": {
            const b = e.b;
            const em = e.e;
            const c = e.c;
            if (st[idx] === 0) {
              g(b, em, 1 / ROFF);
              g(c, em, 1 / ROFF);
            } else {
              // Base-emitter junction: diode (forward b→e for NPN, e→b for PNP).
              if (!e.pnp) source(b, em, VBE, RBE);
              else source(em, b, VBE, RBE);
              if (st[idx] === 1) {
                // Active: Ic = β·Ib = β·(Vbe − 0.65)/RBE, from c to e (NPN) or e to c (PNP).
                const gm = e.beta / RBE;
                if (!e.pnp) {
                  vccs(c, em, b, em, gm);
                  cur(em, c, gm * VBE);
                } else {
                  vccs(em, c, em, b, gm);
                  cur(c, em, gm * VBE);
                }
              } else {
                // Saturated: a small source across C-E.
                if (!e.pnp) source(c, em, VCE_SAT, RCE_SAT);
                else source(em, c, VCE_SAT, RCE_SAT);
              }
            }
            break;
          }
          case "M":
            if (st[idx] === 1) g(e.d, e.s, 1 / e.ron);
            else g(e.d, e.s, 1 / ROFF);
            break;
        }
      });

      const x = rhs;
      if (!solveDense(A, x, n)) return { v, i: new Float64Array(this.elems.length), ok: false };
      v = new Float64Array(this.nodes);
      for (let k = 1; k < this.nodes; k++) v[k] = x[k - 1];

      // Re-guess device states from the voltages.
      let changed = false;
      this.elems.forEach((e, idx) => {
        let s = st[idx];
        if (e.t === "D") {
          const vd = v[e.a] - v[e.k];
          if (s === 0 && vd > e.vf + 1e-6) s = 1;
          else if (s === 1 && (vd - e.vf) / e.ron < -1e-9) s = 0;
        } else if (e.t === "Q") {
          const sign = e.pnp ? -1 : 1;
          const vbe = sign * (v[e.b] - v[e.e]);
          const vce = sign * (v[e.c] - v[e.e]);
          const ib = (vbe - VBE) / RBE;
          if (s === 0) {
            if (vbe > VBE + 1e-6) s = vce > VCE_SAT ? 1 : 2;
          } else if (ib < -1e-9) s = 0;
          else if (s === 1 && vce < VCE_SAT - 1e-6) s = 2;
          else if (s === 2) {
            const ic = (vce - VCE_SAT) / RCE_SAT;
            if (ic > e.beta * ib + 1e-9) s = 1;
          }
        } else if (e.t === "M") {
          const vgs = e.p ? v[e.s] - v[e.g] : v[e.g] - v[e.s];
          s = vgs > e.vth ? 1 : 0;
        }
        if (s !== st[idx]) {
          st[idx] = s;
          changed = true;
        }
      });
      if (!changed) return { v, i: this.currents(v, drives), ok: true };
    }
    return { v, i: this.currents(v, drives), ok: false };
  }

  /** Current through each element (positive: a→b, anode→cathode, into the collector/drain). */
  private currents(v: Float64Array, drives: Map<string, Drive>): Float64Array {
    const out = new Float64Array(this.elems.length);
    this.elems.forEach((e, idx) => {
      const s = this.state[idx];
      switch (e.t) {
        case "R":
          out[idx] = (v[e.a] - v[e.b]) / Math.max(e.r, 1e-6);
          break;
        case "V":
          out[idx] = (e.v - (v[e.a] - v[e.b])) / Math.max(e.r, 1e-6); // current leaving the + terminal
          break;
        case "X": {
          const d = drives.get(e.key);
          out[idx] = d ? (d.v - (v[e.a] - v[e.b])) / Math.max(d.r, 1e-6) : 0;
          break;
        }
        case "D":
          out[idx] = s === 1 ? (v[e.a] - v[e.k] - e.vf) / e.ron : (v[e.a] - v[e.k]) / ROFF;
          break;
        case "Q": {
          const sign = e.pnp ? -1 : 1;
          const ib = Math.max(0, (sign * (v[e.b] - v[e.e]) - VBE) / RBE);
          out[idx] = s === 0 ? 0 : s === 1 ? e.beta * ib : Math.max(0, (sign * (v[e.c] - v[e.e]) - VCE_SAT) / RCE_SAT);
          break;
        }
        case "M":
          out[idx] = (e.p ? v[e.s] - v[e.d] : v[e.d] - v[e.s]) / (s === 1 ? e.ron : ROFF);
          break;
      }
    });
    return out;
  }
}
