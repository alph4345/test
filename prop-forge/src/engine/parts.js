// Turns part descriptions into Manifold solids.
import { ShapeUtils, Vector2 } from 'three';
import { expandSymmetric, sampleCurve, ensureCCW, isSimplePolygon, rayHit, signedArea } from './geom2d.js';

export function profileOutline(part) {
  const pts = part.symmetric ? expandSymmetric(part.points) : part.points;
  let samples = sampleCurve(pts, true, 5);
  if (signedArea(samples.map((s) => s.p)) < 0) samples = samples.reverse();
  return samples;
}

export function latheOutline(part) {
  const samples = sampleCurve(part.points.map((p) => ({ ...p, x: Math.max(0, p.x) })), !!part.closedRing, 4);
  let poly = samples.map((s) => [Math.max(0, s.p[0]), s.p[1]]);
  if (!part.closedRing) {
    const first = poly[0], last = poly[poly.length - 1];
    if (first[0] > 1e-6) poly.unshift([0, first[1]]);
    if (last[0] > 1e-6) poly.push([0, last[1]]);
  }
  return ensureCCW(poly);
}

// Inset each outline vertex towards the inside by its bevel width. Returns
// null if the inset outline is not a simple polygon.
function insetOutline(P, d) {
  const n = P.length;
  const Q = new Array(n);
  for (let i = 0; i < n; i++) {
    if (d[i] <= 0) { Q[i] = P[i]; continue; }
    const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n];
    let ax = b[0] - a[0], ay = b[1] - a[1], cx = c[0] - b[0], cy = c[1] - b[1];
    const la = Math.hypot(ax, ay) || 1, lc = Math.hypot(cx, cy) || 1;
    ax /= la; ay /= la; cx /= lc; cy /= lc;
    const na = [-ay, ax], nc = [-cy, cx];
    let mx = na[0] + nc[0], my = na[1] + nc[1];
    const ml = Math.hypot(mx, my);
    if (ml < 1e-6) { mx = na[0]; my = na[1]; } else { mx /= ml; my /= ml; }
    const cosHalf = Math.max(0.35, mx * na[0] + my * na[1]);
    let move = d[i] / cosHalf;
    const hit = rayHit(P, b, [mx, my], i);
    move = Math.min(move, hit * 0.45);
    Q[i] = [b[0] + mx * move, b[1] + my * move];
  }
  return isSimplePolygon(Q) ? Q : null;
}

// Blade-style extrusion: the flat middle is `thickness` thick and every
// sharp outline point tapers to `edge` over `bevel` mm.
export function bevelledMesh(M, samples, thickness, edge, bevel) {
  const P = samples.map((s) => s.p);
  const n = P.length;
  const T = thickness / 2;
  const e = Math.min(edge, thickness) / 2;
  let scale = 1, Q = null;
  const base = samples.map((s) => (s.s && bevel > 0 && e < T ? bevel : 0));
  if (base.every((v) => v === 0)) return null;
  for (let it = 0; it < 8 && !Q; it++) {
    Q = insetOutline(P, base.map((v) => v * scale));
    scale *= 0.7;
  }
  if (!Q) return null;
  const sharp = base.map((v, i) => v > 0 && (Q[i][0] !== P[i][0] || Q[i][1] !== P[i][1]));
  const verts = [];
  const add = (x, y, z) => { verts.push(x, y, z); return verts.length / 3 - 1; };
  const oT = [], oB = [], iT = [], iB = [];
  for (let i = 0; i < n; i++) {
    const h = sharp[i] ? e : T;
    oT[i] = add(P[i][0], P[i][1], h);
    oB[i] = add(P[i][0], P[i][1], -h);
    if (sharp[i]) { iT[i] = add(Q[i][0], Q[i][1], T); iB[i] = add(Q[i][0], Q[i][1], -T); }
    else { iT[i] = oT[i]; iB[i] = oB[i]; }
  }
  const tris = [];
  const poly = (ids) => {
    const u = [];
    for (const id of ids) if (u[u.length - 1] !== id) u.push(id);
    while (u.length > 1 && u[0] === u[u.length - 1]) u.pop();
    for (let k = 1; k + 1 < u.length; k++) tris.push(u[0], u[k], u[k + 1]);
  };
  const faces = ShapeUtils.triangulateShape(Q.map((q) => new Vector2(q[0], q[1])), []);
  for (const [a, b, c] of faces) {
    tris.push(iT[a], iT[b], iT[c]);
    tris.push(iB[a], iB[c], iB[b]);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    poly([oT[i], oT[j], iT[j], iT[i]]);
    poly([oB[i], oB[j], oT[j], oT[i]]);
    poly([oB[j], oB[i], iB[i], iB[j]]);
  }
  const mesh = new M.Mesh({ numProp: 3, vertProperties: new Float32Array(verts), triVerts: new Uint32Array(tris) });
  mesh.merge();
  const m = M.newManifold(mesh);
  if (m.status() !== "NoError" || m.isEmpty() || m.volume() <= 0) return null;
  return m;
}

function extrudeFlat(M, poly, thickness) {
  const cs = M.newCrossSection([poly]);
  const m = cs.extrude(thickness).translate([0, 0, -thickness / 2]);
  return m;
}

// Build the untransformed solid for one part (local coordinates).
export function partSolid(M, part) {
  switch (part.type) {
    case 'profile': {
      const samples = profileOutline(part);
      if (samples.length < 3) return null;
      const t = Math.max(0.4, +part.thickness || 10);
      const bev = bevelledMesh(M, samples, t, +part.edge || t, +part.bevel || 0);
      return bev || extrudeFlat(M, samples.map((s) => s.p), t);
    }
    case 'lathe': {
      const poly = latheOutline(part);
      if (poly.length < 3) return null;
      const cs = M.newCrossSection([poly]);
      const m = cs.revolve(Math.max(3, part.sides | 0 || 48), part.sweep || 360).rotate([-90, 0, 0]);
      return m;
    }
    case 'box': {
      const [x, y, z] = part.size || [10, 10, 10];
      return M.Manifold.cube([x, y, z], true);
    }
    case 'cylinder': {
      const h = +part.height || 10;
      return M.Manifold.cylinder(h, +part.r1 || 5, part.r2 == null ? +part.r1 || 5 : +part.r2, Math.max(3, part.sides | 0 || 48), true)
        .rotate([-90, 0, 0]);
    }
    case 'sphere':
      return M.Manifold.sphere(+part.r || 10, Math.max(8, part.sides | 0 || 48));
    default:
      return null;
  }
}

export function placeSolid(m, part) {
  const r = part.rot || [0, 0, 0];
  const p = part.pos || [0, 0, 0];
  let out = m;
  if (r[0] || r[1] || r[2]) out = out.rotate(r);
  if (p[0] || p[1] || p[2]) out = out.translate(p);
  return out;
}

// All placed copies of a part (mirror / radial array), before global scale.
export function partInstances(M, part) {
  let base = partSolid(M, part);
  if (!base) return [];
  const st = part.stretch;
  if (st && (st[0] !== 1 || st[1] !== 1 || st[2] !== 1)) base = base.scale(st.map((v) => +v || 1));
  const placed = placeSolid(base, part);
  const out = [placed];
  const copies = part.copies || { mode: 'none' };
  if (copies.mode === 'mirrorX') out.push(placed.mirror([1, 0, 0]));
  else if (copies.mode === 'mirrorZ') out.push(placed.mirror([0, 0, 1]));
  else if (copies.mode === 'radial') {
    const n = Math.max(2, copies.count | 0 || 4);
    for (let i = 1; i < n; i++) out.push(placed.rotate([0, (360 * i) / n, 0]));
  }
  return out;
}

// Cylinder from point a to point b (used for channels, pins, pockets).
export function rod(M, a, b, r, sides = 32) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...d);
  if (len < 1e-6) return null;
  const theta = (Math.acos(Math.max(-1, Math.min(1, d[2] / len))) * 180) / Math.PI;
  const phi = (Math.atan2(d[1], d[0]) * 180) / Math.PI;
  return M.Manifold.cylinder(len, r, r, sides, false).rotate([0, theta, phi]).translate(a);
}

export function boxFromBounds(M, min, max) {
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  if (size.some((s) => s <= 0)) return null;
  return M.Manifold.cube(size, false).translate(min);
}
