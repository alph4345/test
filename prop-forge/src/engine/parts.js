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
    taper: part.tipThickness != null && part.tipThickness !== '' ? { to: Math.max(0.4, +part.tipThickness), y0: Math.min(...ys), y1: Math.max(...ys) } : null,
  };
}

function extrudeFlat(M, poly, thickness) {
  const cs = M.newCrossSection([poly]);
  const m = cs.extrude(thickness).translate([0, 0, -thickness / 2]);
  return m;
}

// Imported meshes are passed alongside the design (they are kept out of
// the design itself so undo and autosave stay light).
let meshSource = {};
export function setMeshSource(m) { meshSource = m || {}; }

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
    case 'mesh': {
      const data = meshSource[part.meshRef];
      if (!data) { warn(`"${part.name}": the imported model's data is missing. Import the STL again.`); return null; }
      const mesh = new M.Mesh({ numProp: 3, vertProperties: Float32Array.from(data.verts), triVerts: Uint32Array.from(data.tris) });
      mesh.merge();
      let m = null;
      try { m = M.newManifold(mesh); } catch { m = null; }
      if (!m || m.status() !== 'NoError' || m.isEmpty()) {
        warn(`"${part.name}": this STL is not watertight (it has holes or loose faces), so it can't be cut or joined. Repair it first (e.g. Windows 3D Builder, Meshmixer, or your slicer's "fix model"), then import it again.`);
        return null;
      }
      if (m.volume() < 0) m = m.mirror([0, 0, 1]).mirror([0, 0, 1]);
      const u = +part.unit || 1;
      return u !== 1 ? m.scale(u) : m;
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
  let base = partSolid(M, part, warn);
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
