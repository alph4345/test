// Turns part descriptions into Manifold solids.
import { expandSymmetric, sampleCurve, ensureCCW, signedArea } from './geom2d.js';
import { bladeMesh } from './blade.js';

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

function meshSolid(M, data) {
  const mesh = new M.Mesh({ numProp: 3, vertProperties: data.verts, triVerts: data.tris });
  mesh.merge();
  let m;
  try { m = M.newManifold(mesh); } catch { return null; }
  if (m.status() !== 'NoError' || m.isEmpty() || m.volume() <= 0) return null;
  return m;
}

// true when a profile part needs the ground-blade mesh rather than a slab
export function hasGrind(part) {
  const t = +part.thickness || 10;
  const sharp = (part.points || []).some((p) => p.s);
  const taper = part.tipThickness != null && part.tipThickness !== '' && +part.tipThickness !== t;
  return (sharp && +part.bevel > 0 && +part.edge < t) || taper;
}

export function bladeOptions(part, samples) {
  const ys = samples.map((s) => s.p[1]);
  const t = Math.max(0.4, +part.thickness || 10);
  return {
    thickness: t,
    edge: Math.max(0.4, Math.min(t, +part.edge || t)),
    bevel: Math.max(0, +part.bevel || 0),
    grind: part.grind || 'flat',
    sides: part.sides || 'both',
    // distal taper from the base to the tip (or over `taperY` [from, to])
    taper: part.tipThickness != null && part.tipThickness !== ''
      ? { to: Math.max(0.4, +part.tipThickness), y0: part.taperY ? +part.taperY[0] : Math.min(...ys), y1: part.taperY ? +part.taperY[1] : Math.max(...ys) } : null,
  };
}

function extrudeFlat(M, poly, thickness) {
  const cs = M.newCrossSection([poly]);
  const m = cs.extrude(thickness).translate([0, 0, -thickness / 2]);
  return m;
}

// Changes the proportions of an imported model without breaking it.
// Lengthwise, y -> Y(y) is piecewise linear through `stops` [[y, newY], ...]
// (slope 1 beyond the ends); across, x -> cx + (x - cx) * k(y) and
// z -> cz + (z - cz) * t(y), with k and t piecewise linear through
// `widths` / `thick` [[y, factor], ...] (outside a `core` half-width that
// keeps its size). Every map is continuous and
// monotonic, so a watertight mesh stays watertight.
function lerpTable(table, y, slopeOut) {
  if (!table || !table.length) return slopeOut ? y : 1;
  const n = table.length;
  if (y <= table[0][0]) return slopeOut ? table[0][1] + (y - table[0][0]) : table[0][1];
  if (y >= table[n - 1][0]) return slopeOut ? table[n - 1][1] + (y - table[n - 1][0]) : table[n - 1][1];
  let i = 1;
  while (table[i][0] < y) i++;
  const [y0, v0] = table[i - 1], [y1, v1] = table[i];
  return v0 + ((v1 - v0) * (y - y0)) / (y1 - y0 || 1);
}

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function warpPoint(w, x, y, z) {
  if (!w) return [x, y, z];
  // pull a corner of the outline out into a point (e.g. a blade's heel):
  // y moves by d at (x0, y0), fading to nothing by x1 and by y1; it only
  // ever stretches, so the mesh stays valid
  if (w.heel) {
    const h = w.heel;
    y -= h.d * smooth((h.x1 - x) / (h.x1 - h.x0)) * smooth((h.y1 - y) / (h.y1 - h.y0));
  }
  // scale outward from an axis along Y, leaving a core (e.g. a tsuba's
  // centre hole) as it is
  if (w.radial) {
    const r0 = w.radial, dx = x - (r0.cx || 0), dz = z - (r0.cz || 0), r = Math.hypot(dx, dz);
    if (r > r0.core) { const f = (r0.core + (r - r0.core) * r0.k) / r; x = (r0.cx || 0) + dx * f; z = (r0.cz || 0) + dz * f; }
  }
  const k = lerpTable(w.widths, y, false), t = lerpTable(w.thick, y, false);
  const cx = w.cx || 0, cz = w.cz || 0;
  // a core strip (e.g. a row of holes down the middle) keeps its width
  const core = w.core || 0;
  const dx = x - cx;
  const ax = Math.abs(dx) <= core ? dx : Math.sign(dx) * (core + (Math.abs(dx) - core) * k);
  return [cx + ax, lerpTable(w.stops, y, true), cz + (z - cz) * t];
}

function warpVerts(w, verts, unit = 1) {
  const out = new Float32Array(verts.length);
  for (let i = 0; i < verts.length; i += 3) {
    const p = warpPoint(w, verts[i] * unit, verts[i + 1] * unit, verts[i + 2] * unit);
    out[i] = p[0]; out[i + 1] = p[1]; out[i + 2] = p[2];
  }
  return out;
}

// Revolver cylinder along Y (front face at +Y): chamfered drum with flutes
// cut by a ball-end cutter, chamber holes in the front face, a centre hole
// for the pin it turns on, and cylinder-stop notches at the rear.
function revolverSolid(M, p) {
  const R = Math.max(3, +p.r || 25), L = Math.max(4, +p.length || 60);
  const ch = Math.min(R * 0.2, L * 0.15, Math.max(0, p.chamfer == null ? 2 : +p.chamfer));
  const prof = [[0, -L / 2], [R - ch, -L / 2], [R, -L / 2 + ch], [R, L / 2 - ch], [R - ch, L / 2], [0, L / 2]];
  const body = M.newCrossSection([prof]).revolve(96).rotate([-90, 0, 0]);
  const cut = [];
  const nf = Math.max(0, p.flutes | 0), nc = Math.max(0, p.chambers | 0);
  const chamberAt = (i) => (i / Math.max(1, nc)) * Math.PI * 2;
  if (nf > 0) {
    const fr = Math.max(1, +p.fluteR || R * 0.2);
    const depth = Math.min(fr * 0.95, Math.max(0.5, +p.fluteDepth || fr * 0.55));
    const d = R + fr - depth;
    const len = Math.max(fr, (p.fluteLen == null ? 0.6 : +p.fluteLen) * L);
    const style = p.fluteStyle || 'front';
    let y0, y1;
    if (style === 'full') { y0 = -L / 2 - fr * 2; y1 = L / 2 + fr * 2; }
    else if (style === 'closed') { const m = Math.max(fr * 0.6, (L - len) / 2); y0 = -L / 2 + m; y1 = L / 2 - m; }
    else { y1 = L / 2 + fr * 2; y0 = L / 2 - len; }
    const ball = M.Manifold.sphere(fr, 32);
    const offset = nc === nf ? Math.PI / nf : 0;
    for (let i = 0; i < nf; i++) {
      const a = (i / nf) * Math.PI * 2 + offset;
      const x = d * Math.cos(a), z = d * Math.sin(a);
      cut.push(M.Manifold.hull([ball.translate([x, y0, z]), ball.translate([x, y1, z])]));
    }
  }
  if (nc > 0) {
    const cr = Math.max(0.5, +p.chamberR || R * 0.17);
    const rc = Math.min(R - cr - 1.2, Math.max(cr + (+p.pinR || 0) + 1, +p.chamberAt || R * 0.55));
    const depth = p.chamberDepth == null ? L : Math.min(L, +p.chamberDepth);
    for (let i = 0; i < nc; i++) {
      const a = chamberAt(i);
      cut.push(M.Manifold.cylinder(depth + 1, cr, cr, 32, false).rotate([-90, 0, 0]).translate([rc * Math.cos(a), L / 2 - depth, rc * Math.sin(a)]));
    }
  }
  if (+p.pinR > 0) cut.push(M.Manifold.cylinder(L + 2, +p.pinR, +p.pinR, 40, true).rotate([-90, 0, 0]));
  if (p.notches && nc > 0) {
    const w = Math.max(1.5, R * 0.12), h = Math.max(2, L * 0.1), dep = Math.max(0.8, R * 0.06);
    for (let i = 0; i < nc; i++) {
      const a = chamberAt(i);
      cut.push(M.Manifold.cube([dep * 2, h, w], true).translate([R, -L / 2 + ch + h / 2 + 1.5, 0]).rotate([0, (-a * 180) / Math.PI, 0]));
    }
  }
  return cut.length ? body.subtract(M.Manifold.union(cut)) : body;
}

// Imported meshes are passed alongside the design (they are kept out of
// the design itself so undo and autosave stay light).
let meshSource = {};
export function setMeshSource(m) { meshSource = m || {}; }

// Raw (non-watertight) imported mesh placed like a part would be: stretch,
// unit, rotation (X then Y then Z), translation, then the design scale.
export function rawMeshPlaced(part, scale = 1) {
  const data = meshSource[part.meshRef];
  if (!data) return null;
  const st = part.stretch || [1, 1, 1];
  let u = +part.unit || 1;
  let src = data.verts;
  if (part.warp) { src = warpVerts(part.warp, src, u); u = 1; }
  const [rx, ry, rz] = (part.rot || [0, 0, 0]).map((d) => (d * Math.PI) / 180);
  const p = part.pos || [0, 0, 0];
  const out = new Float32Array(data.verts.length);
  for (let i = 0; i < out.length; i += 3) {
    let x = src[i] * st[0] * u, y = src[i + 1] * st[1] * u, z = src[i + 2] * st[2] * u;
    [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
    [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
    [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
    out[i] = (x + p[0]) * scale; out[i + 1] = (y + p[1]) * scale; out[i + 2] = (z + p[2]) * scale;
  }
  return { verts: out, tris: Uint32Array.from(data.tris) };
}

// Build the untransformed solid for one part (local coordinates).
export function partSolid(M, part, warn = () => {}) {
  switch (part.type) {
    case 'profile': {
      const samples = profileOutline(part);
      if (samples.length < 3) return null;
      const t = Math.max(0.4, +part.thickness || 10);
      if (hasGrind(part)) {
        const data = bladeMesh(samples, bladeOptions(part, samples));
        const m = data && meshSolid(M, data);
        if (m) return m;
        warn(`"${part.name}": the edge grind could not be built for this outline (does it cross itself?), so it is shown flat.`);
      }
      return extrudeFlat(M, samples.map((s) => s.p), t);
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
    case 'revolver':
      return revolverSolid(M, part);
    case 'mesh': {
      const data = meshSource[part.meshRef];
      if (!data) { warn(`"${part.name}": the imported model's data is missing. Import the STL again.`); return null; }
      const u0 = +part.unit || 1;
      const verts = part.warp ? warpVerts(part.warp, data.verts, u0) : Float32Array.from(data.verts);
      const mesh = new M.Mesh({ numProp: 3, vertProperties: verts, triVerts: Uint32Array.from(data.tris) });
      mesh.merge();
      let m = null;
      try { m = M.newManifold(mesh); } catch { m = null; }
      if (!m || m.status() !== 'NoError' || m.isEmpty()) {
        warn(`"${part.name}": this STL is not watertight (it has holes or loose faces), so it can't be cut or joined. Repair it first (e.g. Windows 3D Builder, Meshmixer, or your slicer's "fix model"), then import it again.`);
        return null;
      }
      if (m.volume() < 0) m = m.mirror([0, 0, 1]).mirror([0, 0, 1]);
      return u0 !== 1 && !part.warp ? m.scale(u0) : m;
    }
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
export function partInstances(M, part, warn) {
  const base = partSolid(M, part, warn);
  return base ? placeInstances(base, part) : [];
}

// Stretch, place and copy a part's local solid.
export function placeInstances(base, part) {
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
