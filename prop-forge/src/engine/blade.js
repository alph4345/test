// Blade solids with a real edge grind.
//
// The outline is triangulated (constrained Delaunay, with extra points laid
// out in rows along the sharp edges) and every vertex is lifted to the
// thickness the grind asks for at its distance from the sharp edge. Top
// and bottom surfaces are joined by a wall around the outline, so the
// result is always a closed, printable solid; it cannot silently fall back
// to a flat slab the way an inset outline can.
import Delaunator from 'delaunator';
import Constrainautor from '@kninnug/constrainautor';
import { pointInPolys } from './geom2d.js';

export const GRINDS = {
  flat: (t) => t, // straight bevel (V / flat grind)
  convex: (t) => 1 - (1 - t) * (1 - t), // rounded "appleseed" grind
  hollow: (t) => t * t, // concave, thin behind the edge
};

function segDist(px, py, ax, ay, bx, by) {
  const ex = bx - ax, ey = by - ay;
  const l2 = ex * ex + ey * ey;
  let t = l2 > 0 ? ((px - ax) * ex + (py - ay) * ey) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = ax + t * ex - px, dy = ay + t * ey - py;
  return Math.sqrt(dx * dx + dy * dy);
}

// Densify the outline so no boundary edge is longer than `step`.
function densify(samples, step) {
  const out = [];
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    const a = samples[i], b = samples[(i + 1) % n];
    out.push(a);
    const len = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1]);
    const k = Math.floor(len / step);
    // added points are nudged a hair outwards: exactly collinear boundary
    // points make the triangulation emit zero-area triangles (outwards, so
    // parts that sit flush against this edge still fuse with it)
    const nx = (b.p[1] - a.p[1]) / (len || 1), ny = -(b.p[0] - a.p[0]) / (len || 1);
    for (let j = 1; j <= k; j++) {
      const t = j / (k + 1);
      const bow = 0.002 * Math.sin(Math.PI * t) + 0.001;
      out.push({ p: [a.p[0] + (b.p[0] - a.p[0]) * t + nx * bow, a.p[1] + (b.p[1] - a.p[1]) * t + ny * bow], s: a.s && b.s });
    }
  }
  return out;
}

// Spatial hash used to keep extra points apart.
class Grid {
  constructor(cell) { this.cell = cell; this.map = new Map(); }
  key(x, y) { return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}`; }
  near(x, y, r) {
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
    for (let i = cx - 1; i <= cx + 1; i++) for (let j = cy - 1; j <= cy + 1; j++) {
      const list = this.map.get(`${i},${j}`);
      if (list) for (const [qx, qy] of list) if ((qx - x) ** 2 + (qy - y) ** 2 < r * r) return true;
    }
    return false;
  }
  add(x, y) {
    const k = this.key(x, y);
    if (!this.map.has(k)) this.map.set(k, []);
    this.map.get(k).push([x, y]);
  }
}

// Heights of the top and bottom surface at a point.
export function grindHeights(opts, d, y) {
  const { thickness: T0, edge, bevel, grind = 'flat', sides = 'both', taper } = opts;
  let T = T0;
  if (taper && taper.to != null && taper.y1 > taper.y0) {
    const u = Math.min(1, Math.max(0, (y - taper.y0) / (taper.y1 - taper.y0)));
    T = T0 + (taper.to - T0) * u;
  }
  const e = Math.min(edge, T);
  const g = (GRINDS[grind] || GRINDS.flat)(bevel > 0 ? Math.min(1, d / bevel) : 1);
  if (sides === 'front') return [-T / 2 + e + (T - e) * g, -T / 2];
  if (sides === 'back') return [T / 2, T / 2 - e - (T - e) * g];
  const h = e / 2 + (T / 2 - e / 2) * g;
  return [h, -h];
}

// samples: CCW outline [{p:[x,y], s:sharp}]. Returns raw mesh arrays or null.
export function bladeMesh(samples, opts) {
  const T = opts.thickness;
  if (!(T > 0)) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { p } of samples) {
    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
  }
  const area = Math.abs(samples.reduce((s, q, i) => {
    const r = samples[(i + 1) % samples.length];
    return s + q.p[0] * r.p[1] - r.p[0] * q.p[1];
  }, 0)) / 2;
  const bevel = Math.max(0, opts.bevel || 0);
  // point spacing: fine enough to show the grind, coarse enough to stay fast
  let step = Math.sqrt(area / 3000);
  step = Math.max(1.5, Math.min(12, step));
  if (bevel > 0) step = Math.min(step, Math.max(1.5, bevel / 3));
  const bnd = densify(samples, step);
  const n = bnd.length;
  const poly = [bnd.map((b) => b.p)];
  const sharpSegs = [];
  for (let i = 0; i < n; i++) {
    const a = bnd[i], b = bnd[(i + 1) % n];
    if (a.s && b.s) sharpSegs.push([a.p[0], a.p[1], b.p[0], b.p[1]]);
  }
  // sharp corner points with blunt neighbours still count as sharp
  const sharpPts = bnd.filter((b, i) => b.s && !bnd[(i + 1) % n].s && !bnd[(i - 1 + n) % n].s).map((b) => b.p);
  const distSharp = (x, y) => {
    let d = Infinity;
    for (const s of sharpSegs) { const v = segDist(x, y, s[0], s[1], s[2], s[3]); if (v < d) d = v; }
    for (const q of sharpPts) { const v = Math.hypot(x - q[0], y - q[1]); if (v < d) d = v; }
    return d;
  };
  const distBoundary = (x, y) => {
    let d = Infinity;
    for (let i = 0; i < n; i++) {
      const a = bnd[i].p, b = bnd[(i + 1) % n].p;
      const v = segDist(x, y, a[0], a[1], b[0], b[1]);
      if (v < d) d = v;
    }
    return d;
  };

  const pts = bnd.map((b) => b.p.slice());
  const grid = new Grid(step);
  for (const p of pts) grid.add(p[0], p[1]);
  const tryAdd = (x, y, minGap) => {
    if (!pointInPolys(poly, x, y)) return;
    if (grid.near(x, y, minGap)) return;
    if (distBoundary(x, y) < minGap * 0.6) return;
    pts.push([x, y]);
    grid.add(x, y);
  };
  // rows of points following the sharp edges, so the grind line is clean
  if (bevel > 0 && sharpSegs.length) {
    const rows = Math.max(2, Math.min(8, Math.round(bevel / step)));
    const offs = [];
    for (let k = 1; k <= rows; k++) offs.push((bevel * k) / rows);
    for (let i = 0; i < n; i++) {
      if (!bnd[i].s) continue;
      const a = bnd[(i - 1 + n) % n].p, b = bnd[i].p, c = bnd[(i + 1) % n].p;
      let nx = -(c[1] - a[1]), ny = c[0] - a[0];
      const l = Math.hypot(nx, ny) || 1;
      nx /= l; ny /= l; // inward normal for a CCW outline
      for (const o of offs) {
        const x = b[0] + nx * o, y = b[1] + ny * o;
        const d = distSharp(x, y);
        if (Math.abs(d - o) > step * 0.75) continue; // rows from opposite edges would overlap
        tryAdd(x, y, step * 0.55);
      }
    }
  }
  // interior fill
  const fill = step * (bevel > 0 ? 1.6 : 2.5);
  for (let y = minY + fill / 2; y < maxY; y += fill) {
    for (let x = minX + fill / 2; x < maxX; x += fill) tryAdd(x, y, fill * 0.55);
  }

  const flat = new Float64Array(pts.length * 2);
  pts.forEach((p, i) => { flat[i * 2] = p[0]; flat[i * 2 + 1] = p[1]; });
  let del;
  try {
    del = new Delaunator(flat);
    const con = new Constrainautor(del);
    for (let i = 0; i < n; i++) con.constrainOne(i, (i + 1) % n);
  } catch {
    return null;
  }
  const tris = [];
  const t = del.triangles;
  for (let k = 0; k < t.length; k += 3) {
    let a = t[k], b = t[k + 1], c = t[k + 2];
    const cx = (pts[a][0] + pts[b][0] + pts[c][0]) / 3, cy = (pts[a][1] + pts[b][1] + pts[c][1]) / 3;
    if (!pointInPolys(poly, cx, cy)) continue;
    const cross = (pts[b][0] - pts[a][0]) * (pts[c][1] - pts[a][1]) - (pts[b][1] - pts[a][1]) * (pts[c][0] - pts[a][0]);
    if (Math.abs(cross) < 1e-12) continue;
    if (cross < 0) [b, c] = [c, b];
    tris.push(a, b, c);
  }
  if (!tris.length) return null;

  const N = pts.length;
  const verts = new Float32Array(N * 6);
  for (let i = 0; i < N; i++) {
    const [x, y] = pts[i];
    const d = i < n && bnd[i].s ? 0 : distSharp(x, y);
    const [top, bot] = grindHeights(opts, d, y);
    verts.set([x, y, top], i * 3);
    verts.set([x, y, bot], (N + i) * 3);
  }
  const idx = [];
  for (let k = 0; k < tris.length; k += 3) {
    idx.push(tris[k], tris[k + 1], tris[k + 2]);
    idx.push(N + tris[k], N + tris[k + 2], N + tris[k + 1]);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    idx.push(N + i, N + j, j, N + i, j, i);
  }
  return { verts, tris: new Uint32Array(idx) };
}
