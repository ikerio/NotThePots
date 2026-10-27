import { COLS, ROWS } from './levels.js';

export function cellX(c) { return c - COLS / 2 + 0.5; }
export function cellZ(r) { return r - ROWS / 2 + 0.5; }
export function toCell(x, z) { return { c: Math.floor(x + COLS / 2), r: Math.floor(z + ROWS / 2) }; }

const SOLID = new Set(['S', 'M', 'C', 'B', 'X', 'P', 'T']);
const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

export class Grid {
  constructor(layout) {
    this.cols = COLS;
    this.rows = ROWS;
    this.cells = [];
    this.version = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = layout[r][c] || '.';
        this.cells.push({ c, r, ch, solid: SOLID.has(ch), pot: null, plant: null });
        if (ch === 'D') this.door = { c, r };
      }
    }
  }

  idx(c, r) { return r * COLS + c; }
  inside(c, r) { return c >= 0 && r >= 0 && c < COLS && r < ROWS; }
  get(c, r) { return this.inside(c, r) ? this.cells[this.idx(c, r)] : null; }
  walkable(c, r) { const k = this.get(c, r); return !!k && !k.solid; }
  free(c, r) { const k = this.get(c, r); return !!k && !k.solid && !k.pot && !k.plant; }
  placeable(c, r) {
    const k = this.get(c, r);
    return !!k && !k.solid && !k.pot && !k.plant && k.ch !== 'D';
  }

  setPot(c, r, pot) { this.get(c, r).pot = pot; this.version++; }
  setPlant(c, r, plant) { this.get(c, r).plant = plant; this.version++; }

  // Dijkstra over the shop floor. Pots and plants can be "walked through" at a
  // cost (the hero lifts or fights them), but only entered orthogonally.
  flow(sc, sr, potCost = 3, plantCost = 5) {
    const n = COLS * ROWS;
    const dist = new Float32Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    dist[this.idx(sc, sr)] = 0;
    for (;;) {
      let best = -1, bd = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; best = i; }
      if (best < 0) break;
      done[best] = 1;
      const c = best % COLS, r = (best / COLS) | 0;
      const here = this.cells[best];
      // you cannot keep walking past a pot cell in the same plan step diagonally
      for (const [dc, dr, w] of DIRS) {
        const nc = c + dc, nr = r + dr;
        const k = this.get(nc, nr);
        if (!k || k.solid) continue;
        const diag = dc !== 0 && dr !== 0;
        const blockedCell = k.pot || k.plant;
        if (diag) {
          if (blockedCell || here.pot || here.plant) continue;
          if (!this.free(c + dc, r) || !this.free(c, r + dr)) continue;
        }
        let cost = w;
        if (k.pot) cost += potCost;
        if (k.plant) cost += plantCost;
        const ni = this.idx(nc, nr);
        if (bd + cost < dist[ni]) { dist[ni] = bd + cost; prev[ni] = best; }
      }
    }
    return { dist, prev, start: this.idx(sc, sr) };
  }

  pathTo(flow, c, r) {
    let i = this.idx(c, r);
    if (!isFinite(flow.dist[i])) return null;
    const out = [];
    while (i !== flow.start && i >= 0) {
      out.push({ c: i % COLS, r: (i / COLS) | 0 });
      i = flow.prev[i];
    }
    return out.reverse();
  }

  freeCells() { return this.cells.filter((k) => !k.solid && !k.pot && !k.plant); }
}
